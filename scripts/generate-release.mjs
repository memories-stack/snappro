import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version || '2.6.5';
const notes = pkg.releaseNotes || 'SnapPro Studio Release';
const distDir = path.join(root, 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

const cssMatch = html.match(/href="\.?\/assets\/([^"]+\.css)"/);
const jsMatch = html.match(/src="\.?\/assets\/([^"]+\.js)"/);

if (!cssMatch || !jsMatch) {
  throw new Error('Could not find CSS/JS asset tags in dist/index.html');
}

const css = fs.readFileSync(path.join(distDir, 'assets', cssMatch[1]), 'utf8');
const js = fs.readFileSync(path.join(distDir, 'assets', jsMatch[1]), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]+>/, () => `<style>${css}</style>`);
html = html.replace(/<script type="module"[^>]+><\/script>/, () => `<script type="module">${js}</script>`);

// 1. Write full self-contained Web/Offline Studio App bundles
fs.writeFileSync(path.join(distDir, 'SnapPro-Offline.html'), html, 'utf8');
fs.writeFileSync(path.join(distDir, 'app.html'), html, 'utf8');
fs.writeFileSync(path.join(root, 'SnapPro-Offline.html'), html, 'utf8');

// 2. Write manifest for OTA auto-update
const dmgUrl = `https://github.com/memories-stack/snappro/releases/download/v${version}/SnapPro-Installer.dmg`;
const manifest = {
  version,
  minNativeVersion: '2.6.0',
  releasedAt: new Date().toISOString(),
  notes,
  htmlUrl: 'https://memories-stack.github.io/snappro/SnapPro-Offline.html',
  dmgUrl,
};
fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(manifest, null, 2), 'utf8');

// 3. Write sleek Landing & Download Page to dist/index.html (root GitHub Pages)
const landingHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SnapPro Studio — AI Video Frame Darkroom &amp; Super-Resolution</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: radial-gradient(circle at 20% 10%, #0f172a 0%, #070b14 60%, #030712 100%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      padding: 24px 16px 48px;
      line-height: 1.55;
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 22px;
      padding: 28px 24px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(18px);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.35);
      margin-bottom: 18px;
    }
    h1 {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.2;
      margin-bottom: 12px;
      color: #ffffff;
    }
    .subtitle {
      font-size: 15px;
      color: #94a3b8;
      margin-bottom: 24px;
    }
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 15px 18px;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      background: linear-gradient(90deg, #10b981 0%, #2563eb 100%);
      box-shadow: 0 10px 28px rgba(37, 99, 235, 0.35);
      transition: transform 0.15s ease, filter 0.15s ease;
      margin-bottom: 12px;
    }
    .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .btn-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 24px;
    }
    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 11px 12px;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 600;
      color: #e2e8f0;
      text-decoration: none;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.22);
      transition: background 0.15s ease;
      text-align: center;
    }
    .btn-secondary:hover { background: rgba(51, 65, 85, 0.85); }
    .features {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }
    .feat-box {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      padding: 15px 16px;
    }
    .feat-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .feat-desc {
      font-size: 13.5px;
      color: #94a3b8;
    }
    .guide-box {
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(251, 191, 36, 0.28);
      border-radius: 14px;
      padding: 14px 16px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .guide-box strong { color: #fcd34d; }
    .guide-box ol { margin: 8px 0 0 18px; }
    .guide-box li { margin-bottom: 4px; }
    .footer {
      margin-top: 18px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge" id="ver-badge">SnapPro Studio v${version} • macOS Universal (All-in-One)</div>
    <h1>SnapPro Studio — AI Video Frame &amp; Super-Res</h1>
    <p class="subtitle">
      สตูดิโอแคปภาพจากวิดีโอความละเอียดสูง ปรับสี แต่งภาพ คัดภาพเบลอ และขยายความคมชัด 16-Tap GPU Super-Resolution สูงสุด 45.4MP (Nikon FX-L) แบบชุดใหญ่ความเร็วสูง (ออฟไลน์ 100%)
    </p>

    <a id="dmg-btn" class="btn-primary" href="${dmgUrl}">
      ⬇️ ดาวน์โหลด SnapPro-Installer.dmg (macOS)
    </a>

    <div class="btn-row">
      <a class="btn-secondary" href="./app.html">🌐 เปิดใช้งานบนเว็บ</a>
      <a class="btn-secondary" href="https://github.com/memories-stack/snappro/releases/latest">📦 ดู Releases ทั้งหมด</a>
    </div>

    <div class="features">
      <div class="feat-box">
        <div class="feat-title">✂️ AI Full-Body Symmetric Crop (3:2 / 2:3)</div>
        <div class="feat-desc">ตรวจจับใบหน้า เส้นผม หมวก และปลายรองเท้า แล้วจัดวางตัวแบบกึ่งกลางบน–ล่างสมมาตร เผื่อพื้นที่วางโลโก้งานอัตโนมัติ</div>
      </div>
      <div class="feat-box">
        <div class="feat-title">🚀 GPU 16-Tap Super-Resolution (สูงสุด 45.4MP)</div>
        <div class="feat-desc">ขยายภาพจากวิดีโอ 1080p เป็น Nikon DX / FX-L (5504×8256 px) ด้วย WebGL2 พร้อมระบบถนอมสีผิวและลด Noise ฉากหลัง</div>
      </div>
      <div class="feat-box">
        <div class="feat-title">🎯 AI Blur Filter &amp; Best-Shot</div>
        <div class="feat-desc">วิเคราะห์ความคมชัดทุกวินาที ควานหาช็อตที่นิ่งที่สุดและคัดภาพเบลอออกจากชุดงานโดยอัตโนมัติ</div>
      </div>
      <div class="feat-box">
        <div class="feat-title">☁️ Auto-Update ออนไลน์ในแอป</div>
        <div class="feat-desc">แจ้งเตือนและอัปเดตเวอร์ชันใหม่ให้อัตโนมัติภายในตัวแอปทันที ไม่ต้องดาวน์โหลดตัวติดตั้งใหม่ซ้ำ</div>
      </div>
    </div>

    <div class="guide-box">
      <strong>🍎 วิธีเปิดแอปครั้งแรกบน macOS (ทำครั้งเดียว):</strong>
      <ol>
        <li>หากขึ้นแจ้งเตือน <em>"SnapPro Not Opened"</em> ให้กด <strong>Done</strong></li>
        <li>เปิด <strong>System Settings</strong> (รูปเฟือง) → <strong>Privacy &amp; Security</strong></li>
        <li>เลื่อนลงล่างสุด กดปุ่ม <strong>Open Anyway</strong> → ใส่รหัสเครื่อง Mac ก็ใช้งานได้ตลอดชีพครับ</li>
      </ol>
    </div>

    <div class="footer">
      SnapPro Studio • Apple Silicon (M1–M4) &amp; Intel Universal • 100% Offline Processing
    </div>
  </main>

  <script>
    fetch('./version.json?t=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (!d || !d.version) return;
        var b = document.getElementById('ver-badge');
        var a = document.getElementById('dmg-btn');
        if (b) b.textContent = 'SnapPro Studio v' + d.version + ' • macOS Universal (All-in-One)';
        if (a && d.dmgUrl) a.href = d.dmgUrl;
      })
      .catch(function() {});
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, 'index.html'), landingHtml, 'utf8');
console.log(`Generated dist/index.html (Landing), dist/app.html & dist/SnapPro-Offline.html (${html.length} bytes), and dist/version.json (v${version})`);
