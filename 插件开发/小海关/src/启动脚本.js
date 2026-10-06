export function generateStartScript(C, { V, DIR, LOGF, BOOT_SH, secret }) {
  const out = C.logEnabled ? LOGF : '/dev/null';
  /* 接管设置写入脚本,供页面不在场的开机自启使用。
     F14: bootMode 消费——core=只起引擎不恢复接管(探活后也不挂规则);keep=按保存设置恢复。 */
  const takeover = ((C.s1 !== 'off' || C.s2) && C.bootMode !== 'core') ? '1' : '0';
  return '#!/bin/sh\n'
    + '#gen:v' + V + '\n'
    + 'D=' + DIR + '\n'
    + '[ -x $D/mihomo ] || exit 1\n'
    /* F15: 单实例守卫经 readlink 所有权核验——同名他装 mihomo(异路径 exe)不算已在跑,不误判 already-running */
    + 'HS_P=""; for HS_Q in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$HS_Q/exe 2>/dev/null)" = $D/mihomo ] && HS_P="$HS_P $HS_Q"; done\n'
    + '[ -n "$HS_P" ] && { echo "already running:$HS_P"; exit 0; }\n'
    + 'HS_HEAD_OK=0\n'
    + 'for HS_I in 1 2 3; do\n'
    + '  HS_CODE=$(curl -s -m 8 -o /tmp/.hs_head -w "%{http_code}" http://127.0.0.1:2333/api/get_custom_head 2>/dev/null)\n'
    + '  [ "$HS_CODE" = "200" ] && { HS_HEAD_OK=1; break; }\n'
    + '  sleep 8\n'
    + 'done\n'
    + 'if [ "$HS_HEAD_OK" = "1" ] && ! grep -q "__customs_loaded" /tmp/.hs_head 2>/dev/null; then\n'
    + '  sh $D/fw.sh clean >/dev/null 2>&1\n'
    + "  sed -i '\\|# plugins/customs|d' " + BOOT_SH + " 2>/dev/null\n"
    /* F15: 清理经所有权核验,只杀本插件二进制实例,同名他装进程不动 */
    + '  for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe 2>/dev/null)" = $D/mihomo ] && kill $P 2>/dev/null; done\n'
    + '  sleep 1\n'
    + '  for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe 2>/dev/null)" = $D/mihomo ] && kill -9 $P 2>/dev/null; done\n'
    + '  rm -rf $D /tmp/.hs_head\n'
    + '  exit 0\n'
    + 'fi\n'
    + 'rm -f /tmp/.hs_head\n'
    + '[ -f $D/customs.log ] && [ "$(wc -c < $D/customs.log)" -ge 262144 ] && : > $D/customs.log\n'
    + 'export GOMEMLIMIT=' + (C.lowMem ? '48MiB' : '128MiB') + '\n'
    + 'nohup sh -c \'' + DIR + '/mihomo -d ' + DIR + '; sh ' + DIR + '/fw.sh clean >/dev/null 2>&1\' > ' + out + ' 2>&1 &\n' /* 退出钩子: 引擎进程退出(含 kill/崩溃)后同 shell 顺序执行 fw.sh clean——审查 P1-2 已验证: nohup sh -c 内分号链在子进程退出后继续执行,孤儿规则被清理 */
    + 'HS_TAKEOVER=' + takeover + '\n'
    + '(\n'
    + '  HS_OK=0\n'
    + '  for HS_W in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do\n'
    /* F14: 探活鉴权+HTTP 状态码判定——带 Authorization(与端口同源自配置)且仅 200 算就绪;
       401/连接失败继续等(修复 401 也算就绪的 F01 同型残留) */
    + '    HS_CODE=$(curl -s -m 2 -o /dev/null -H \'Authorization: Bearer ' + secret + '\' -w \'%{http_code}\' http://127.0.0.1:' + C.ports.ctrl + '/version 2>/dev/null)\n'
    + '    [ "$HS_CODE" = "200" ] && { HS_OK=1; break; }\n'
    + '    sleep 1\n'
    + '  done\n'
    + '  [ "$HS_OK" = "1" ] && [ "$HS_TAKEOVER" = "1" ] && sh $D/fw.sh apply >/dev/null 2>&1\n'
    + '  [ "$HS_OK" = "0" ] && [ "$HS_TAKEOVER" = "1" ] && { echo "1" > $D/.bootmiss; echo "$(date)引擎未就绪,跳过规则挂载(防黑洞)" >> $D/customs.log; }\n' /* 审查P2-9: 写 .bootmiss 标记——collectStatus 读到后 toast */
    + ') &\n';
}
