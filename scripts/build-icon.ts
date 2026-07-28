// 앱 아이콘 생성기:
//   1. 여백이 있는 archimedean spiral 좌표 계산
//   2. SVG 문자열 생성 (paper + solid cobalt — Spiral Buddy Blue 정체성)
//   3. 1024 PNG 출력 — @resvg/resvg-js가 있으면 사용
//
// 출력: electron/build/icon.svg, electron/build/icon.png

import fs from "node:fs";
import path from "node:path";

const SIZE = 1024;
const CENTER = SIZE / 2;

// Archimedean spiral: r(θ) = a + b·θ.
// 앱 아이콘 크기에서는 빼곡한 4+턴보다 2.35턴이 더 선명하게 읽힌다.
const TURNS = 2.35;
const POINTS = 420;
const START_R = SIZE * 0.058;
const OUTER_R = SIZE * 0.32;
const B = (OUTER_R - START_R) / (TURNS * 2 * Math.PI);
const OFFSET = -Math.PI / 2.08;

function spiralPath(): string {
  const cmds: string[] = [];
  for (let i = 0; i <= POINTS; i++) {
    const t = i / POINTS;
    const theta = t * TURNS * 2 * Math.PI;
    const r = START_R + B * theta;
    const angle = theta + OFFSET;
    const x = CENTER + r * Math.cos(angle);
    const y = CENTER + r * Math.sin(angle);
    cmds.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return cmds.join(" ");
}

function svg(): string {
  const d = spiralPath();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <!-- Spiral Buddy Blue: a single cobalt field and a white learning path. -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="220" ry="220" fill="#1d5bd8"/>
  <rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" rx="204" ry="204"
        fill="none" stroke="#ffffff" stroke-width="6" opacity="0.16"/>

  <!-- open spiral (archimedean, ${TURNS}턴) -->
  <path d="${d}"
        stroke="#ffffff"
        stroke-width="58"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"/>

  <circle cx="${CENTER}" cy="${CENTER}" r="18" fill="#ffffff"/>
</svg>
`;
}

async function main() {
  const buildDir = path.resolve("electron/build");
  fs.mkdirSync(buildDir, { recursive: true });
  const svgPath = path.join(buildDir, "icon.svg");
  fs.writeFileSync(svgPath, svg(), "utf-8");
  console.log(`✓ ${svgPath}`);

  // 가능하면 @resvg/resvg-js로 PNG도 같이 생성. 없으면 SVG만.
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(svg(), { fitTo: { mode: "width", value: SIZE } })
      .render()
      .asPng();
    const pngPath = path.join(buildDir, "icon.png");
    fs.writeFileSync(pngPath, png);
    console.log(`✓ ${pngPath} (${SIZE}x${SIZE})`);
  } catch (err) {
    console.log(
      "ℹ @resvg/resvg-js 없음 — SVG만 생성됨. PNG 만들려면: pnpm add -D @resvg/resvg-js",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
