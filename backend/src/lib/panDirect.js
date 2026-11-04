/**
 * 网盘直链的请求头规则，对应 hmjz100/LinkSwift 的说明：
 * 直链来自网盘自己的下载接口，脚本跑在用户已登录的网盘页面里。
 * 百度超过约 50MB 的直链要用 UA「pan.baidu.com」，阿里云盘直链要带上网盘 Referer，否则 CDN 会 403。
 * 这里不保存账号、Cookie，也不代登网盘。
 */

const SHARE_RULES = [
  [/pan\.baidu\.com\/(?:s|share)\//i, '百度网盘'],
  [/pan\.quark\.cn\/s\//i, '夸克网盘'],
  [/drive\.uc\.cn\/s\//i, 'UC网盘'],
  [/(?:alipan|aliyundrive)\.com\/s\//i, '阿里云盘'],
  [/123(?:pan|684|865|912|952)\.(?:com|cn)\/s\//i, '123云盘'],
  [/pan\.xunlei\.com\/s\//i, '迅雷云盘'],
  [/cloud\.189\.cn\/(?:t\/|web\/share)/i, '天翼云盘'],
  [/yun\.139\.com\/(?:w\/|share)/i, '中国移动云盘'],
  [/guangyapan\.com\/(?:s\/|share)/i, '光鸭云盘'],
];

const PAN_PAGE_RE =
  /(?:^|\.)(?:pan\.baidu\.com|pan\.quark\.cn|drive\.uc\.cn|alipan\.com|aliyundrive\.com|123pan\.(?:com|cn)|123(?:684|865|912|952)\.com|pan\.xunlei\.com|cloud\.189\.cn|yun\.139\.com|guangyapan\.com)$/i;

const UA = {
  baidu: 'pan.baidu.com',
  quark:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 QuarkPC/6.9.7.761',
  uc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/1.8.8 Chrome/100.0.4896.160',
};

export function panShareMessage(name) {
  return `${name}页面不能在服务器上解析。LinkSwift 是在你已登录的网盘里调用官方下载接口，取出直链后再下载，并不破解限速。请把脚本复制出的直链贴到这里：百度直链会自动使用 UA pan.baidu.com，阿里云盘直链会带上 Referer。服务器不保存文件，也不接收网盘账号或 Cookie。`;
}

/**
 * @returns {{ type: 'pan-share'|'pan-page'|'pan-direct'|'other', name?: string, kind?: string }}
 */
export function classifyPanUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return { type: 'other' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { type: 'other' };

  const href = url.href;
  for (const [re, name] of SHARE_RULES) {
    if (re.test(href)) return { type: 'pan-share', name };
  }

  const host = url.hostname.toLowerCase();
  const kind = directKind(host);
  if (kind) return { type: 'pan-direct', kind, name: kind };

  if (PAN_PAGE_RE.test(host)) return { type: 'pan-page', name: '网盘' };
  return { type: 'other' };
}

function directKind(host) {
  if (/(^|\.)pcs\.baidu\.com$/.test(host) || /(^|\.)baidupcs\.com$/.test(host)) return 'baidu';
  if (/(^|\.)aliyundrive\.net$/.test(host) || /(^|\.)aliyuncs\.com$/.test(host)) return 'aliyun';
  if (host.endsWith('.alipan.com') && host !== 'www.alipan.com') return 'aliyun';
  if (host.endsWith('.quark.cn') && host !== 'pan.quark.cn') return 'quark';
  if (host.endsWith('.uc.cn') && host !== 'drive.uc.cn' && host !== 'www.uc.cn') return 'uc';
  if (
    (/123pan\.(com|cn)$/.test(host) || /123(684|865|912|952)\.com$/.test(host)) &&
    !host.startsWith('www.') &&
    !host.startsWith('api.')
  ) {
    return 'pan123';
  }
  if (host.endsWith('.xunlei.com') && host !== 'pan.xunlei.com' && !host.startsWith('api-pan.')) {
    return 'xunlei';
  }
  return '';
}

/** 下载直链时要带的头。调用方用这些头覆盖默认浏览器 UA。 */
export function panRequestHeaders(kind) {
  if (kind === 'baidu') return { 'User-Agent': UA.baidu };
  if (kind === 'aliyun') return { Referer: 'https://www.alipan.com/' };
  if (kind === 'quark') {
    return { 'User-Agent': UA.quark, Referer: 'https://pan.quark.cn/' };
  }
  if (kind === 'uc') return { 'User-Agent': UA.uc, Referer: 'https://drive.uc.cn/' };
  if (kind === 'xunlei') return { Referer: 'https://pan.xunlei.com/' };
  if (kind === 'pan123') return { Referer: 'https://www.123pan.com/' };
  return {};
}

export function nameFromDirectUrl(raw) {
  try {
    const url = new URL(String(raw));
    const named = url.searchParams.get('filename') || url.searchParams.get('fn') || '';
    if (named) return safeDecode(named);
    const base = safeDecode(url.pathname.split('/').filter(Boolean).pop() || '');
    if (/\.[a-z0-9]{1,8}$/i.test(base)) return base;
  } catch {
    /* ignore */
  }
  return '';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
