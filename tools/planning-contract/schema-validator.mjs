import {isDeepStrictEqual} from 'node:util';

const valueType = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

const matchesType = (value, expected) => {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
};

const resolveRef = (rootSchema, ref) => {
  if (!ref.startsWith('#/')) throw new Error(`Only local JSON Schema references are supported: ${ref}`);
  return ref.slice(2).split('/').reduce((value, token) => {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    return value?.[key];
  }, rootSchema);
};

const addIssue = (issues, path, message) => issues.push({path, message});

const walk = (schema, value, path, rootSchema, issues) => {
  if (schema.$ref) {
    const target = resolveRef(rootSchema, schema.$ref);
    if (!target) addIssue(issues, path, `Unresolvable schema reference ${schema.$ref}`);
    else walk(target, value, path, rootSchema, issues);
    return;
  }

  if (schema.const !== undefined && !isDeepStrictEqual(value, schema.const)) {
    addIssue(issues, path, `Expected constant ${JSON.stringify(schema.const)}.`);
  }
  if (schema.enum && !schema.enum.some((entry) => isDeepStrictEqual(value, entry))) {
    addIssue(issues, path, `Expected one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}.`);
  }

  if (schema.type && !matchesType(value, schema.type)) {
    addIssue(issues, path, `Expected ${schema.type}, received ${valueType(value)}.`);
    return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      addIssue(issues, path, `Expected at least ${schema.minLength} character(s).`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      addIssue(issues, path, `Does not match ${schema.pattern}.`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    addIssue(issues, path, `Expected a value greater than or equal to ${schema.minimum}.`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      addIssue(issues, path, `Expected at least ${schema.minItems} item(s).`);
    }
    if (schema.uniqueItems) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((entry) => isDeepStrictEqual(entry, value[index]))) {
          addIssue(issues, `${path}[${index}]`, 'Duplicate item is not allowed.');
        }
      }
    }
    if (schema.items) value.forEach((entry, index) => walk(schema.items, entry, `${path}[${index}]`, rootSchema, issues));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) addIssue(issues, `${path}.${required}`, 'Required property is missing.');
    }
    for (const [key, entry] of Object.entries(value)) {
      if (schema.properties?.[key]) walk(schema.properties[key], entry, `${path}.${key}`, rootSchema, issues);
      else if (schema.additionalProperties === false) addIssue(issues, `${path}.${key}`, 'Additional property is not allowed.');
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        walk(schema.additionalProperties, entry, `${path}.${key}`, rootSchema, issues);
      }
    }
  }
};

export const collectSchemaIssues = (schema, value) => {
  const issues = [];
  walk(schema, value, '$', schema, issues);
  return issues;
};

export const assertSchema = (schema, value, label = schema.title ?? 'JSON document') => {
  const issues = collectSchemaIssues(schema, value);
  if (!issues.length) return value;
  const error = new Error(`${label} failed JSON Schema validation:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
  error.name = 'PlanningContractSchemaError';
  error.issues = issues;
  throw error;
};
