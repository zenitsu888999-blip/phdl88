// app.js
const $ = id => document.getElementById(id);
const urlInput = $('url');
const goBtn = $('go');
const status = $('status');
const result = $('result');
const titleEl = $('title');
const qualities = $('qualities');
const preview = $('preview');

goBtn.addEventListener('click', run);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

async function run() {
  const raw = urlInput.value.trim();
  if (!raw) return setStatus('paste a url first');

  let viewkey;
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('pornhub.com')) throw 0;
    viewkey = u.searchParams.get('viewkey');
    if (!viewkey) throw 0;
  } catch {
    return setStatus('not a valid pornhub view_video url');
  }

  goBtn.disabled = true;
  result.classList.add('hidden');
  preview.classList.add('hidden');
  qualities.innerHTML = '';
  setStatus('fetching page…');

  try {
    // github pages → use a public cors proxy (or your own)
    const proxy = 'https://corsproxy.io/?';
    const pageUrl = `https://www.pornhub.com/view_video.php?viewkey=${viewkey}`;
    const res = await fetch(proxy + encodeURIComponent(pageUrl));
    if (!res.ok) throw new Error('page fetch failed ' + res.status);
    const html = await res.text();

    // title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' - Pornhub.com', '').trim() : viewkey;
    titleEl.textContent = title;

    // extract mediaDefinitions from the flashvars / window.flashvars
    const media = extractMedia(html);
    if (!media.length) throw new Error('no media definitions found (page layout may have changed)');

    // sort by quality descending
    media.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    media.forEach(m => {
      const a = document.createElement('a');
      a.className = 'q-btn';
      a.href = m.videoUrl;
      a.download = `\( {title}_ \){m.quality}p.mp4`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `<strong>\( {m.quality}p</strong><span> \){m.format || 'mp4'}</span>`;
      a.addEventListener('click', e => {
        // also set the preview player
        preview.src = m.videoUrl;
        preview.classList.remove('hidden');
      });
      qualities.appendChild(a);
    });

    result.classList.remove('hidden');
    setStatus(`found ${media.length} quality option(s)`);
  } catch (err) {
    setStatus('error: ' + err.message);
  } finally {
    goBtn.disabled = false;
  }
}

function extractMedia(html) {
  const out = [];

  // modern pornhub stores quality info in a JS object called mediaDefinitions
  // it appears inside a <script> as: "mediaDefinitions":[{…},…]
  const mdMatch = html.match(/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])/);
  if (mdMatch) {
    try {
      const defs = JSON.parse(mdMatch[1]);
      defs.forEach(d => {
        if (d.videoUrl && d.quality) {
          out.push({
            quality: String(d.quality).replace(/p$/i, ''),
            videoUrl: d.videoUrl.replace(/\\u0026/g, '&'),
            format: d.format || 'mp4'
          });
        }
      });
    } catch (_) {}
  }

  // fallback: older flashvars style
  if (!out.length) {
    const fvMatch = html.match(/flashvars_?\d+\s*=\s*({[\s\S]*?});/);
    if (fvMatch) {
      try {
        // crude cleanup so we can eval-ish parse
        const obj = JSON.parse(fvMatch[1].replace(/'/g, '"'));
        if (obj.mediaDefinitions) {
          obj.mediaDefinitions.forEach(d => {
            if (d.videoUrl) {
              out.push({
                quality: String(d.quality || 'unknown').replace(/p$/i, ''),
                videoUrl: d.videoUrl,
                format: d.format || 'mp4'
              });
            }
          });
        }
      } catch (_) {}
    }
  }

  // last-resort regex for direct mp4 links that contain quality
  if (!out.length) {
    const re = /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi;
    const links = [...new Set(html.match(re) || [])];
    links.forEach((url, i) => {
      const q = url.match(/(\d{3,4})p/)?.[1] || (720 - i * 100);
      out.push({ quality: String(q), videoUrl: url, format: 'mp4' });
    });
  }

  return out;
}

function setStatus(msg) {
  status.textContent = msg;
}