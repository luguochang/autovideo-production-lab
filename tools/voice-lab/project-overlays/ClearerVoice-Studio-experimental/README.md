# ClearerVoice Experimental Overlay

上游基线：

```text
https://github.com/modelscope/ClearerVoice-Studio.git
6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61
```

这些文件是归档时在旧机器工作树中发现的本地修改，未成为 AutoVideo 正式生产主链，恢复脚本不会自动应用。

尤其需要注意：`decode_batch.py` 中存在 `np.zeros(b, t)` 形式的本地改动，它可能不是合法的 NumPy shape 调用。使用前必须与上游逐行比较、建立针对性测试并确认修改意图。不要仅因为文件被归档就视为已验证修复。

保留这些文件的目的只是防止探索记录丢失。

