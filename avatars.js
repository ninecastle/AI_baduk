/* avatars.js — 봇 동물 일러스트 (100×100 SVG, 단색 면 + 부드러운 음영) */
(function () {
  const S = (inner, bg1, bg2) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>${inner}</svg>`;
  const eyeAlmond = (x, y, col, slit) => `<path d="M${x - 6} ${y} Q${x} ${y - 6} ${x + 6} ${y} Q${x} ${y + 4} ${x - 6} ${y}Z" fill="${col}"/>` +
    (slit ? `<ellipse cx="${x}" cy="${y - 0.5}" rx="1.3" ry="3.4" fill="#151515"/>` : `<circle cx="${x}" cy="${y - 0.4}" r="2.4" fill="#151515"/>`) +
    `<circle cx="${x + 1.3}" cy="${y - 1.8}" r="0.9" fill="#fff"/>`;
  const ART = {
    // 1 매
    1: S(`
      <path d="M16 100 Q20 72 46 66 Q72 68 84 100Z" fill="#5e412b"/>
      <path d="M30 86 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#7d5a3d" stroke-width="3" stroke-linecap="round"/>
      <path d="M28 62 C24 40 36 22 56 22 C70 22 78 32 78 42 L71 47 C69 60 58 70 44 72 C35 72 30 68 28 62Z" fill="#7a5a3e"/>
      <path d="M28 62 C25 46 30 34 40 27 C34 36 32 48 36 60Z" fill="#664a32"/>
      <path d="M40 50 C47 52 60 52 70 48 C66 60 56 70 44 72 C38 71 33 66 33 59 C35 54 37 52 40 50Z" fill="#f3ebd9"/>
      <path d="M53 45 Q55 56 51 66 L46 65 Q49 55 47.5 45Z" fill="#3a291c"/>
      <path d="M53 31 Q62 26 72 33 L69 36 Q62 31 55 35Z" fill="#3a291c"/>
      <circle cx="62" cy="39" r="6.4" fill="#f5c542"/><circle cx="62" cy="39" r="3.7" fill="#161616"/><circle cx="63.6" cy="37.4" r="1.2" fill="#fff"/>
      <path d="M66 34 Q74 31 79 36 L80 44 L70 47Z" fill="#f2c230"/>
      <path d="M74 35 Q90 34 91 48 Q90 58 83 59 Q84 51 79 49 L70 47Z" fill="#3a3f46"/>
      <path d="M70 47 L80 49 Q78 53 72 53Z" fill="#2a2e33"/>
      <path d="M78 38 Q86 39 88 46" fill="none" stroke="#5f666f" stroke-width="1.6" stroke-linecap="round"/>`, '#9d86e6', '#4f3c96'),
    // 2 늑대
    2: S(`
      <path d="M16 100 Q20 72 50 69 Q80 72 84 100Z" fill="#5d646e"/>
      <path d="M26 42 L29 11 L47 31Z" fill="#59606a"/><path d="M30 34 L31.5 19 L41 30Z" fill="#d8b6a2"/>
      <path d="M74 42 L71 11 L53 31Z" fill="#59606a"/><path d="M70 34 L68.5 19 L59 30Z" fill="#d8b6a2"/>
      <path d="M50 25 C67 25 79 36 79 52 C79 64 71 72 62 78 L50 87 L38 78 C29 72 21 64 21 52 C21 36 33 25 50 25Z" fill="#8a929c"/>
      <path d="M44 28 Q50 46 56 28 Q50 25 44 28Z" fill="#6c737d"/>
      <path d="M22 54 C27 70 38 79 50 87 C62 79 73 70 78 54 C69 64 61 67 50 67 C39 67 31 64 22 54Z" fill="#e9ebee"/>
      <ellipse cx="50" cy="69" rx="11" ry="12" fill="#f3f4f6"/>
      <path d="M31 46 Q38 42 45 47" fill="none" stroke="#4d535c" stroke-width="2" stroke-linecap="round"/><path d="M69 46 Q62 42 55 47" fill="none" stroke="#4d535c" stroke-width="2" stroke-linecap="round"/>
      ${eyeAlmond(38, 51, '#f0b429')}${eyeAlmond(62, 51, '#f0b429')}
      <path d="M44.5 62 Q50 58.5 55.5 62 Q53.5 67.5 50 67.5 Q46.5 67.5 44.5 62Z" fill="#26272a"/>
      <path d="M50 67.5 V71.5 M45.5 73.5 Q50 76 54.5 73.5" fill="none" stroke="#5b5f66" stroke-width="1.6" stroke-linecap="round"/>`, '#9aa6b5', '#3e4651'),
    // 3 곰
    3: S(`
      <path d="M12 100 Q16 72 50 70 Q84 72 88 100Z" fill="#5a3d2a"/>
      <circle cx="27" cy="31" r="10.5" fill="#7a5438"/><circle cx="27" cy="31" r="5.6" fill="#c2946b"/>
      <circle cx="73" cy="31" r="10.5" fill="#7a5438"/><circle cx="73" cy="31" r="5.6" fill="#c2946b"/>
      <ellipse cx="50" cy="54" rx="30" ry="28" fill="#8d5f3d"/>
      <path d="M22 60 C24 72 34 80 50 82 C36 76 28 68 26 56Z" fill="#7a5134"/>
      <ellipse cx="50" cy="67" rx="15" ry="11.5" fill="#dbb88f"/>
      <ellipse cx="50" cy="60.5" rx="6.6" ry="4.8" fill="#2a1c15"/><ellipse cx="48.2" cy="59.2" rx="2" ry="1.1" fill="#6b5446"/>
      <path d="M50 65 V69 M45 71 Q50 74.5 55 71" fill="none" stroke="#5a3d2a" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="38.5" cy="49" r="3.4" fill="#1b130f"/><circle cx="39.6" cy="47.9" r="1" fill="#fff"/>
      <circle cx="61.5" cy="49" r="3.4" fill="#1b130f"/><circle cx="62.6" cy="47.9" r="1" fill="#fff"/>
      <path d="M33 43 Q38.5 40 44 43" fill="none" stroke="#5e3f28" stroke-width="2" stroke-linecap="round"/><path d="M56 43 Q61.5 40 67 43" fill="none" stroke="#5e3f28" stroke-width="2" stroke-linecap="round"/>`, '#c79f78', '#5c412b'),
    // 4 표범
    4: S(`
      <path d="M16 100 Q20 73 50 71 Q80 73 84 100Z" fill="#c48a31"/>
      <path d="M23 40 Q20 19 37 23 Q39 32 34 40Z" fill="#c98d31"/><path d="M27 35 Q26 25 34 27 Q35 31 32 35Z" fill="#3a2a1a"/>
      <path d="M77 40 Q80 19 63 23 Q61 32 66 40Z" fill="#c98d31"/><path d="M73 35 Q74 25 66 27 Q65 31 68 35Z" fill="#3a2a1a"/>
      <path d="M50 25 C68 25 79 38 79 54 C79 70 66 82 50 82 C34 82 21 70 21 54 C21 38 32 25 50 25Z" fill="#e3ac4b"/>
      <g fill="#5b3a19">
        <circle cx="40" cy="33" r="2.1"/><circle cx="50" cy="30.5" r="2.3"/><circle cx="60" cy="33" r="2.1"/><circle cx="45" cy="39" r="1.7"/><circle cx="55" cy="39" r="1.7"/>
        <circle cx="31" cy="44" r="2"/><circle cx="69" cy="44" r="2"/><circle cx="27" cy="54" r="2.2"/><circle cx="73" cy="54" r="2.2"/><circle cx="30" cy="63" r="1.8"/><circle cx="70" cy="63" r="1.8"/>
      </g>
      <ellipse cx="43.5" cy="68" rx="8.5" ry="7" fill="#f7ecd6"/><ellipse cx="56.5" cy="68" rx="8.5" ry="7" fill="#f7ecd6"/><ellipse cx="50" cy="76" rx="8" ry="5" fill="#f7ecd6"/>
      ${eyeAlmond(38.5, 51, '#a8cf3e', true)}${eyeAlmond(61.5, 51, '#a8cf3e', true)}
      <path d="M34 54 Q38 60 42 63" fill="none" stroke="#5b3a19" stroke-width="1.5" stroke-linecap="round"/><path d="M66 54 Q62 60 58 63" fill="none" stroke="#5b3a19" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M45 61.5 L55 61.5 L50 66.5Z" fill="#c4735b"/>
      <path d="M50 66.5 V70 M45.5 72 Q50 74.5 54.5 72" fill="none" stroke="#7b5a3c" stroke-width="1.5" stroke-linecap="round"/>`, '#f2cf7a', '#9a6b1e'),
    // 5 호랑이
    5: S(`
      <path d="M16 100 Q20 73 50 71 Q80 73 84 100Z" fill="#e07a1c"/>
      <path d="M22 40 Q19 18 37 23 Q39 32 34 40Z" fill="#1f1a16"/><path d="M26.5 35 Q25.5 25 33.5 27 Q34.5 31 31.5 35Z" fill="#f6efe3"/>
      <path d="M78 40 Q81 18 63 23 Q61 32 66 40Z" fill="#1f1a16"/><path d="M73.5 35 Q74.5 25 66.5 27 Q65.5 31 68.5 35Z" fill="#f6efe3"/>
      <path d="M50 25 C68 25 80 38 80 54 C80 70 67 82 50 82 C33 82 20 70 20 54 C20 38 32 25 50 25Z" fill="#f28a22"/>
      <path d="M21 56 C26 72 37 81 50 82 C63 81 74 72 79 56 C70 66 60 68 50 68 C40 68 30 66 21 56Z" fill="#fbf5ec"/>
      <path d="M33 40 C35 44 40 45 43 44 C40 48 34 47 31 44Z" fill="#fbf5ec"/><path d="M67 40 C65 44 60 45 57 44 C60 48 66 47 69 44Z" fill="#fbf5ec"/>
      <g fill="none" stroke="#1f1a16" stroke-linecap="round">
        <path d="M43 31 H57" stroke-width="2.6"/><path d="M45.5 36 H54.5" stroke-width="2.4"/><path d="M50 27 V39" stroke-width="2.4"/>
        <path d="M21.5 46 Q29 47 34 51" stroke-width="2.8"/><path d="M21 55 Q27 56 31 59" stroke-width="2.6"/><path d="M78.5 46 Q71 47 66 51" stroke-width="2.8"/><path d="M79 55 Q73 56 69 59" stroke-width="2.6"/>
        <path d="M34 30 Q37 34 37 38" stroke-width="2.2"/><path d="M66 30 Q63 34 63 38" stroke-width="2.2"/>
      </g>
      ${eyeAlmond(39, 51, '#f5c33b')}${eyeAlmond(61, 51, '#f5c33b')}
      <path d="M44.5 61 L55.5 61 L50 66.5Z" fill="#d0675a"/>
      <path d="M50 66.5 V70 M45 72 Q50 75 55 72" fill="none" stroke="#6d5848" stroke-width="1.6" stroke-linecap="round"/>
      <g fill="#6d5848"><circle cx="40" cy="70" r=".9"/><circle cx="37" cy="68" r=".9"/><circle cx="60" cy="70" r=".9"/><circle cx="63" cy="68" r=".9"/></g>`, '#ff9e6e', '#a8321f'),
    // 6 독수리
    6: S(`
      <path d="M16 100 Q20 72 46 70 Q72 72 84 100Z" fill="#4a3123"/>
      <path d="M26 72 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -6" fill="#4a3123"/>
      <path d="M27 66 C23 43 35 24 56 24 C70 24 78 32 78 42 L74 48 C70 62 58 72 44 74 C36 74 29 71 27 66Z" fill="#f6f4ef"/>
      <path d="M27 66 C24 50 28 37 37 29 C32 40 31 54 35 68Z" fill="#dcd7cc"/>
      <path d="M49 33 Q60 28 71 33 L68.5 36 Q60 32 51.5 36.5Z" fill="#c7c0b2"/>
      <circle cx="60" cy="39" r="4.4" fill="#f2c230"/><circle cx="60.4" cy="39" r="2.6" fill="#141414"/><circle cx="61.4" cy="37.9" r=".9" fill="#fff"/>
      <path d="M67 36 Q84 33 90 46 Q91 57 84 59 Q84 51 76 50 L65 48Z" fill="#f2b51c"/>
      <path d="M65 48 L80 50.5 Q76 55 67 54Z" fill="#d89a10"/>
      <path d="M71 40 Q80 39 86 46" fill="none" stroke="#ffd25a" stroke-width="1.6" stroke-linecap="round"/>`, '#7fb6ea', '#1f4f86'),
    // 7 용
    7: S(`
      <path d="M50 14 L58 22 L68 16 L70 28 L82 26 L78 38 L90 42 L80 50 L88 60 L76 62 L78 74 L66 70 L62 82 L50 74 L38 82 L34 70 L22 74 L24 62 L12 60 L20 50 L10 42 L22 38 L18 26 L30 28 L32 16 L42 22Z" fill="#f2b33d"/>
      <path d="M50 20 L56 26 L64 22 L66 30 L76 30 L72 40 L82 44 L74 50 L80 58 L70 58 L70 68 L60 64 L50 70 L40 64 L30 68 L30 58 L20 58 L26 50 L18 44 L28 40 L24 30 L34 30 L36 22 L44 26Z" fill="#e0922a"/>
      <path d="M36 32 Q26 16 30 5 Q37 16 42 30Z" fill="#f6e7bf"/><path d="M64 32 Q74 16 70 5 Q63 16 58 30Z" fill="#f6e7bf"/>
      <path d="M50 24 C66 24 75 35 75 48 C75 56 72 62 70 66 L66 80 C60 87 40 87 34 80 L30 66 C28 62 25 56 25 48 C25 35 34 24 50 24Z" fill="#3fb57a"/>
      <path d="M25 50 C26 60 30 68 34 80 C30 70 28 60 30 48Z" fill="#2f9a65"/><path d="M75 50 C74 60 70 68 66 80 C70 70 72 60 70 48Z" fill="#2f9a65"/>
      <g fill="none" stroke="#2f9a65" stroke-width="1.6" stroke-linecap="round"><path d="M42 33 q4 3 8 0 q4 3 8 0"/><path d="M45 38 q2.5 2 5 0 q2.5 2 5 0"/></g>
      <ellipse cx="50" cy="71" rx="16.5" ry="11.5" fill="#93dbac"/>
      <ellipse cx="44" cy="67" rx="2.4" ry="1.7" fill="#24603f"/><ellipse cx="56" cy="67" rx="2.4" ry="1.7" fill="#24603f"/>
      <path d="M42 76 Q50 80 58 76" fill="none" stroke="#24603f" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M30 44 Q38 39 46 45" fill="none" stroke="#1f6e47" stroke-width="2.4" stroke-linecap="round"/><path d="M70 44 Q62 39 54 45" fill="none" stroke="#1f6e47" stroke-width="2.4" stroke-linecap="round"/>
      ${eyeAlmond(39, 49, '#ffd34d', true)}${eyeAlmond(61, 49, '#ffd34d', true)}
      <path d="M35 71 Q21 72 14 86" fill="none" stroke="#f6d27a" stroke-width="2.4" stroke-linecap="round"/><path d="M65 71 Q79 72 86 86" fill="none" stroke="#f6d27a" stroke-width="2.4" stroke-linecap="round"/>`, '#6fe0a8', '#14674a'),
    // 8 현무 (거북 + 뱀)
    8: S(`
      <ellipse cx="50" cy="98" rx="46" ry="32" fill="#264b48"/>
      <g fill="none" stroke="#3e7570" stroke-width="2.2"><path d="M40 72 L60 72 L66 84 L60 96 L40 96 L34 84Z"/><path d="M34 84 L18 82 M66 84 L82 82 M40 72 L34 66 M60 72 L66 66"/></g>
      <path d="M38 100 L40 70 Q50 66 60 70 L62 100Z" fill="#6b9170"/>
      <path d="M42 80 Q50 84 58 80 M41 88 Q50 92 59 88" fill="none" stroke="#577a5c" stroke-width="1.6" stroke-linecap="round"/>
      <ellipse cx="50" cy="52" rx="21" ry="19" fill="#82aa82"/>
      <path d="M33 44 Q50 30 67 44 Q60 38 50 38 Q40 38 33 44Z" fill="#6b9170"/>
      <g fill="#6b9170"><circle cx="44" cy="40" r="2"/><circle cx="56" cy="40" r="2"/><circle cx="50" cy="36" r="2"/></g>
      <ellipse cx="41.5" cy="51" rx="4.2" ry="4.6" fill="#f2efe2"/><circle cx="42" cy="51.5" r="2.8" fill="#141414"/><circle cx="43" cy="50.4" r=".9" fill="#fff"/>
      <ellipse cx="58.5" cy="51" rx="4.2" ry="4.6" fill="#f2efe2"/><circle cx="58" cy="51.5" r="2.8" fill="#141414"/><circle cx="59" cy="50.4" r=".9" fill="#fff"/>
      <path d="M37 46.5 Q41.5 44 46 46.5 M54 46.5 Q58.5 44 63 46.5" fill="none" stroke="#4f7254" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M40 62 Q50 68 60 62" fill="none" stroke="#3f5f44" stroke-width="2" stroke-linecap="round"/>
      <circle cx="47" cy="58" r=".9" fill="#3f5f44"/><circle cx="53" cy="58" r=".9" fill="#3f5f44"/>
      <path d="M8 94 C14 70 30 66 30 80 C30 92 16 88 20 76" fill="none" stroke="#1b2b2a" stroke-width="6" stroke-linecap="round"/>
      <path d="M70 92 C74 74 88 76 88 62 C88 52 80 50 76 54" fill="none" stroke="#1b2b2a" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="76" cy="52" rx="6.5" ry="4.6" fill="#1b2b2a" transform="rotate(-20 76 52)"/>
      <circle cx="74.5" cy="50.6" r="1.2" fill="#e3c04c"/>
      <path d="M70 54 L65 55 M65 55 L63 53.5 M65 55 L63 56.8" fill="none" stroke="#d65a4a" stroke-width="1" stroke-linecap="round"/>`, '#5fb7b0', '#163f45'),
  };
  for (const k in ART) ART[k] = ART[k].replace('id="g"', 'id="ag' + k + '"').replace('url(#g)', 'url(#ag' + k + ')');
  window.BOT_ART = ART;
})();
