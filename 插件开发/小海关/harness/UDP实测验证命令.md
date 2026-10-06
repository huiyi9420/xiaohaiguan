# UDP tunnels 实测验证命令（v2.7.0 真机验证用）

> 用途：验证「临时 tunnels 隧道 + nslookup」UDP 实测方案的端到端可行性。  
> 使用：复制下方代码块里的**完整一行**，粘贴到设备 WebShell 回车执行。  
> 脚本自动完成：注入临时 tunnel → nslookup 探测 → 输出结果 → 恢复原配置 → 清理临时文件。  
> 预期结果：`PUT=204`（注入成功）、`NS_RC=0` 且解析出 example.com 的 IP（UDP 真实转发成功）、`BACK=204`（恢复成功）。

## 执行命令（base64 整段，不怕折行）

```sh
echo 'RD0vZGF0YS9wbHVnaW5zL2N1c3RvbXMKVz0kKGlwIHJvdXRlIGdldCA4LjguOC44IHwgc2VkIC1uICdzLyogc3JjIFwoWzAtOVwuXSpcKS4qL1wxL3AnKQpTRUM9JChncmVwICcnc2VjcmV0OicgJEQvY29uZmlnLnlhbWwgfCBhd2sgJ3twcmludCAkMn0nIHwgdHIgLWQgJyInIikKY3AgJEQvY29uZmlnLnlhbWwgJEQvLnVkcHQKcHJpbnRmICd0dW5uZWxzOlxuICAtIG5ldHdvcms6IFt1ZHBdXG4gICAgYWRkcmVzczogJXM6NTNcbiAgICB0YXJnZXQ6IDguOC44Ljg6NTNcbiAgICBwcm94eTogRElSRUNUXG4nICIkVyIgPj4gJEQvLnVkcHQKUDE9JChjdXJsIC1zIC1vIC9kZXYvbnVsbCAtdyAnJXtodHRwX2NvZGUnIC1YIFBVVCAtSCAiQXV0aG9yaXphdGlvbjogQmVhcmVyICRTRUMiIC1kICJ7XCJwYXRoXCI6XCIkRC8udWRwdFwifSIgJ2h0dHA6Ly8xMjcuMC4wLjE6OTA5MC9jb25maWdzP2ZvcmNlPXRydWUnKQpzbGVlcCAxCmVjaG8gIlBVVD0kUDEgVz0kVyIKbnNsb29rdXAgZXhhbXBsZS5jb20gJFcgPi90bXAvLm5zciAyPiYxCk5TX1JDPSQ/CmVjaG8gIk5TX1JDPSROU19SQyIKdGFpbCAtMiAvdG1wLy5uc3IKQj0kKGN1cmwgLXMgLW8gL2Rldi9udWxsIC13ICclaHR0cF9jb2RlJyAtWCBQVVQgLUggIkF1dGhvcml6YXRpb246IEJlYXJlciAkU0VDIiAtZCAie1wicGF0aFwiOlwiJEQvY29uZmlnLnlhbWxcIn0iICdodHRwOi8vMTI3LjAuMC4xOjkwOTAvY29uZmlncz9mb3JjZT10cnVlJykKcm0gLWYgJEQvLnVkcHQgL3RtcS8ubnNyCmVjaG8gIkJBQ0s9JEIiCg==' | base64 -d | sh
```

## 如果 base64 也被截断（备用：分三步执行）

### 第 1 步：注入 tunnel

```sh
D=/data/plugins/customs; W=$(ip route get 8.8.8.8 | sed -n 's/.* src \([0-9.]*\).*/\1/p'); SEC=$(grep '^secret:' $D/config.yaml | awk '{print $2}' | tr -d '"'); cp $D/config.yaml $D/.udpt; printf 'tunnels:\n  - network: [udp]\n    address: %s:53\n    target: 8.8.8.8:53\n    proxy: DIRECT\n' "$W" >> $D/.udpt; curl -s -o /dev/null -w 'PUT=%{http_code}\n' -X PUT -H "Authorization: Bearer $SEC" -d "{\"path\":\"$D/.udpt\"}" 'http://127.0.0.1:9090/configs?force=true'
```

### 第 2 步：探测（看到 Address 和 NS_RC=0 即成功）

```sh
nslookup example.com $(ip route get 8.8.8.8 | sed -n 's/.* src \([0-9.]*\).*/\1/p') > /tmp/.nsr 2>&1; echo NS_RC=$?; tail -3 /tmp/.nsr
```

### 第 3 步：恢复 + 清理（无论第 2 步结果如何必须执行）

```sh
D=/data/plugins/customs; SEC=$(grep '^secret:' $D/config.yaml | awk '{print $2}' | tr -d '"'); curl -s -o /dev/null -w 'BACK=%{http_code}\n' -X PUT -H "Authorization: Bearer $SEC" -d "{\"path\":\"$D/config.yaml\"}" 'http://127.0.0.1:9090/configs?force=true'; rm -f $D/.udpt /tmp/.nsr
```

## 结果判读

| 输出                                  | 含义                                            |
| ----------------------------------- | --------------------------------------------- |
| `PUT=204`                           | 临时 tunnel 注入成功（引擎接受 tunnels 格式）               |
| `NS_RC=0` + `Address: 93.184.x.x` 等 | **UDP 实测成功**：DNS 查询经 tunnel→DIRECT→8.8.8.8 往返 |
| `NS_RC=1` / timed out               | UDP 不通（DIRECT 出口的 UDP 被运营商/网络拦，或 tunnel 未生效）  |
| `PUT=400`                           | tunnels 配置格式被引擎拒绝（需回查字段名）                     |
| `BACK=204`                          | 原配置已恢复，临时文件已清理                                |
