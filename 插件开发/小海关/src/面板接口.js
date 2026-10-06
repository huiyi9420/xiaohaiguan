/* ZWRT 文档 §5: 请求经面板 fetch 签名,不依赖或覆盖页面 Shell 函数。 */
export async function hsUploadByApi(file, targetDir) {
  const base = (typeof KANO_baseURL !== 'undefined' && KANO_baseURL) ? KANO_baseURL : '/api';
  const form = new FormData();
  form.append('file', file);
  form.append('path', targetDir);
  const headers = { ...(typeof common_headers !== 'undefined' && common_headers ? common_headers : {}) };
  /* multipart boundary 由浏览器生成。 */
  delete headers['Content-Type'];
  delete headers['content-type'];
  const response = await fetch(base + '/upload_file', { method: 'POST', headers, credentials: 'same-origin', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.result !== 'success') throw new Error(body.error || '上传失败');
  return body;
}
export const hsRunShell = async (cmd, timeoutMs = 30000) => {
  const base = (typeof KANO_baseURL !== 'undefined' && KANO_baseURL) ? KANO_baseURL : '/api';
  const headers = Object.assign({}, (typeof common_headers !== 'undefined' && common_headers) || {});
  headers['Content-Type'] = 'application/json';
  let res = null;
  try {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const tm = ctrl ? setTimeout(() => { try { ctrl.abort() } catch (e) { } }, Number(timeoutMs) || 30000) : null;
    const fr = await fetch(base + '/run_shell', { method: 'POST', headers: headers, credentials: 'same-origin', body: JSON.stringify({ cmd: String(cmd), timeout: Number(timeoutMs) || 30000 }), signal: ctrl ? ctrl.signal : undefined });
    if (tm) clearTimeout(tm);
    const txt = await fr.text();
    res = { ok: fr.ok, status: fr.status, text: txt };
  } catch (e) {
    return { success: false, content: 'Shell 请求失败:' + String((e && e.message) || e) };
  }
  if (!res.ok) return { success: false, content: 'HTTP ' + res.status + (res.status === 401 ? '(鉴权失败——请确认插件运行于已登录的管理页面后重试)' : '') };
  try { const d = JSON.parse(res.text); return { success: !!d.success, content: d.content || '' } }
  catch (e) { return { success: false, content: '响应异常:' + res.text.slice(0, 60) } }
};
export const run = (cmd, t) => hsRunShell(cmd, t);
