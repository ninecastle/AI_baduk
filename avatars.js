/* avatars.js — 봇 동물 일러스트 (100×100 SVG, 단색 면 + 부드러운 음영) */
(function () {
  const S = (inner, bg1, bg2) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>${inner}</svg>`;
  const eyeAlmond = (x, y, col, slit) => `<path d="M${x - 6} ${y} Q${x} ${y - 6} ${x + 6} ${y} Q${x} ${y + 4} ${x - 6} ${y}Z" fill="${col}"/>` +
    (slit ? `<ellipse cx="${x}" cy="${y - 0.5}" rx="1.3" ry="3.4" fill="#151515"/>` : `<circle cx="${x}" cy="${y - 0.4}" r="2.4" fill="#151515"/>`) +
    `<circle cx="${x + 1.3}" cy="${y - 1.8}" r="0.9" fill="#fff"/>`;
  const ART = {
    // 1 매
    hawk: S(`
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
      <path d="M78 38 Q86 39 88 46" fill="none" stroke="#5f666f" stroke-width="1.6" stroke-linecap="round"/>`, '#7fe0c8', '#1f7566'),
    // 2 늑대
    wolf: S(`
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
      <path d="M50 67.5 V71.5 M45.5 73.5 Q50 76 54.5 73.5" fill="none" stroke="#5b5f66" stroke-width="1.6" stroke-linecap="round"/>`, '#9aa0ff', '#2e2b80'),
    // 3 곰
    bear: S(`
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
      <path d="M33 43 Q38.5 40 44 43" fill="none" stroke="#5e3f28" stroke-width="2" stroke-linecap="round"/><path d="M56 43 Q61.5 40 67 43" fill="none" stroke="#5e3f28" stroke-width="2" stroke-linecap="round"/>`, '#9ad8f7', '#245f92'),
    // 4 표범
    leopard: S(`
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
      <path d="M50 66.5 V70 M45.5 72 Q50 74.5 54.5 72" fill="none" stroke="#7b5a3c" stroke-width="1.5" stroke-linecap="round"/>`, '#c995f5', '#552490'),
    // 5 호랑이
    tiger: S(`
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
      <g fill="#6d5848"><circle cx="40" cy="70" r=".9"/><circle cx="37" cy="68" r=".9"/><circle cx="60" cy="70" r=".9"/><circle cx="63" cy="68" r=".9"/></g>`, '#6f8cf5', '#1b2c80'),
    // 6 독수리
    eagle: S(`
      <path d="M16 100 Q20 72 46 70 Q72 72 84 100Z" fill="#4a3123"/>
      <path d="M26 72 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -7 l5 7 l4 -6" fill="#4a3123"/>
      <path d="M27 66 C23 43 35 24 56 24 C70 24 78 32 78 42 L74 48 C70 62 58 72 44 74 C36 74 29 71 27 66Z" fill="#f6f4ef"/>
      <path d="M27 66 C24 50 28 37 37 29 C32 40 31 54 35 68Z" fill="#dcd7cc"/>
      <path d="M49 33 Q60 28 71 33 L68.5 36 Q60 32 51.5 36.5Z" fill="#c7c0b2"/>
      <circle cx="60" cy="39" r="4.4" fill="#f2c230"/><circle cx="60.4" cy="39" r="2.6" fill="#141414"/><circle cx="61.4" cy="37.9" r=".9" fill="#fff"/>
      <path d="M67 36 Q84 33 90 46 Q91 57 84 59 Q84 51 76 50 L65 48Z" fill="#f2b51c"/>
      <path d="M65 48 L80 50.5 Q76 55 67 54Z" fill="#d89a10"/>
      <path d="M71 40 Q80 39 86 46" fill="none" stroke="#ffd25a" stroke-width="1.6" stroke-linecap="round"/>`, '#ffae78', '#ad3f24'),
    // 7 용
    dragon: S(`
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
      <path d="M35 71 Q21 72 14 86" fill="none" stroke="#f6d27a" stroke-width="2.4" stroke-linecap="round"/><path d="M65 71 Q79 72 86 86" fill="none" stroke="#f6d27a" stroke-width="2.4" stroke-linecap="round"/>`, '#f47a8b', '#861a39'),
    // 8 현무 (거북 + 뱀)
    turtle: S(`
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
      <path d="M70 54 L65 55 M65 55 L63 53.5 M65 55 L63 56.8" fill="none" stroke="#d65a4a" stroke-width="1" stroke-linecap="round"/>`, '#f7cf6a', '#9c5a15'),
    chick: S(`
      <path d="M50 22 Q46 14 50 10 Q54 15 52 22Z" fill="#f5a623"/><path d="M52 22 Q58 14 62 16 Q58 20 54 23Z" fill="#f5a623"/>
      <ellipse cx="50" cy="64" rx="31" ry="33" fill="#ffd43b"/>
      <path d="M22 70 C22 88 36 98 50 98 C34 94 26 84 26 68Z" fill="#f2bd1d"/>
      <path d="M20 74 Q12 66 18 58 Q26 64 26 74Z" fill="#f7c524"/><path d="M80 74 Q88 66 82 58 Q74 64 74 74Z" fill="#f7c524"/>
      <ellipse cx="50" cy="44" rx="22" ry="20" fill="#ffdc55"/>
      <circle cx="41" cy="44" r="3.6" fill="#1b1b1b"/><circle cx="42.3" cy="42.7" r="1.2" fill="#fff"/>
      <circle cx="59" cy="44" r="3.6" fill="#1b1b1b"/><circle cx="60.3" cy="42.7" r="1.2" fill="#fff"/>
      <circle cx="34" cy="52" r="4" fill="#ff9e8a" opacity=".7"/><circle cx="66" cy="52" r="4" fill="#ff9e8a" opacity=".7"/>
      <path d="M44 50 L56 50 L50 58Z" fill="#f08c1e"/><path d="M44 50 L56 50 L50 53Z" fill="#f7a63a"/>`, '#ff9a8a', '#a8344a'),
    rabbit: S(`
      <ellipse cx="38" cy="24" rx="7.5" ry="21" fill="#f2eef1" transform="rotate(-8 38 24)"/><ellipse cx="38" cy="25" rx="3.6" ry="15" fill="#f5b2c5" transform="rotate(-8 38 25)"/>
      <ellipse cx="62" cy="24" rx="7.5" ry="21" fill="#f2eef1" transform="rotate(8 62 24)"/><ellipse cx="62" cy="25" rx="3.6" ry="15" fill="#f5b2c5" transform="rotate(8 62 25)"/>
      <path d="M18 100 Q22 76 50 74 Q78 76 82 100Z" fill="#e2dce1"/>
      <ellipse cx="50" cy="60" rx="25" ry="23" fill="#f6f3f5"/>
      <path d="M26 64 C28 76 38 83 50 83 C40 79 32 72 30 60Z" fill="#e6e0e5"/>
      <circle cx="40.5" cy="56" r="3.6" fill="#2a1f24"/><circle cx="41.8" cy="54.7" r="1.2" fill="#fff"/>
      <circle cx="59.5" cy="56" r="3.6" fill="#2a1f24"/><circle cx="60.8" cy="54.7" r="1.2" fill="#fff"/>
      <circle cx="33" cy="65" r="4" fill="#f7a9bd" opacity=".75"/><circle cx="67" cy="65" r="4" fill="#f7a9bd" opacity=".75"/>
      <path d="M46.5 64 L53.5 64 L50 67.5Z" fill="#e98aa5"/>
      <path d="M50 67.5 V70 M46 72 Q48 73.5 50 70 Q52 73.5 54 72" fill="none" stroke="#8c7a83" stroke-width="1.4" stroke-linecap="round"/>
      <g stroke="#b9adb4" stroke-width="1" stroke-linecap="round"><path d="M38 67 L26 66 M38 69.5 L27 71"/><path d="M62 67 L74 66 M62 69.5 L73 71"/></g>`, '#f59ac8', '#86265f'),
    squirrel: S(`
      <path d="M66 100 C98 84 100 44 80 28 C68 20 56 28 62 38 C82 50 82 78 58 94Z" fill="#b85f22"/>
      <path d="M68 92 C88 78 90 50 76 36 C70 32 64 34 66 38 C80 50 80 74 62 88Z" fill="#d97c35"/>
      <path d="M14 100 Q18 78 44 76 Q66 78 70 100Z" fill="#b35d24"/>
      <path d="M32 100 Q34 84 44 82 Q54 84 56 100Z" fill="#f2d6b0"/>
      <path d="M28 40 L27 24 L38 34Z" fill="#b35d24"/><path d="M27 24 L25 18 L30 22Z" fill="#7a3d14"/>
      <path d="M60 40 L61 24 L50 34Z" fill="#b35d24"/><path d="M61 24 L63 18 L58 22Z" fill="#7a3d14"/>
      <ellipse cx="44" cy="56" rx="21" ry="20" fill="#c96a2b"/>
      <ellipse cx="44" cy="65" rx="11.5" ry="9" fill="#f4dcb8"/>
      <circle cx="36.5" cy="52" r="3.8" fill="#1d130d"/><circle cx="37.8" cy="50.6" r="1.3" fill="#fff"/>
      <circle cx="51.5" cy="52" r="3.8" fill="#1d130d"/><circle cx="52.8" cy="50.6" r="1.3" fill="#fff"/>
      <ellipse cx="44" cy="61" rx="3" ry="2.1" fill="#3a2418"/>
      <path d="M44 63 V66 M41 67.5 Q44 69.5 47 67.5" fill="none" stroke="#8a5a3a" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M41 69.5 h6 v4 h-6z" fill="#fff"/>`, '#6fd3d8', '#1c6474'),
    cat: S(`
      <path d="M16 100 Q20 74 50 72 Q80 74 84 100Z" fill="#7f868d"/>
      <path d="M22 44 L26 14 L44 30Z" fill="#8f979f"/><path d="M27 37 L29 21 L39 30Z" fill="#f2b6c0"/>
      <path d="M78 44 L74 14 L56 30Z" fill="#8f979f"/><path d="M73 37 L71 21 L61 30Z" fill="#f2b6c0"/>
      <path d="M50 26 C68 26 79 38 79 54 C79 70 66 81 50 81 C34 81 21 70 21 54 C21 38 32 26 50 26Z" fill="#9ea6ad"/>
      <g fill="none" stroke="#5c6369" stroke-width="2.4" stroke-linecap="round"><path d="M44 29 L45.5 38"/><path d="M50 28 V38"/><path d="M56 29 L54.5 38"/><path d="M22 52 L30 53"/><path d="M22.5 59 L29 59"/><path d="M78 52 L70 53"/><path d="M77.5 59 L71 59"/></g>
      <ellipse cx="43.5" cy="67" rx="8.5" ry="7" fill="#f4f4f4"/><ellipse cx="56.5" cy="67" rx="8.5" ry="7" fill="#f4f4f4"/><ellipse cx="50" cy="74" rx="7" ry="4.5" fill="#f4f4f4"/>
      ${eyeAlmond(39, 51, '#c3d84a', true)}${eyeAlmond(61, 51, '#c3d84a', true)}
      <path d="M46 61 L54 61 L50 65Z" fill="#e88a9b"/>
      <path d="M50 65 V68 M46 70 Q48 71.5 50 68 Q52 71.5 54 70" fill="none" stroke="#6d7379" stroke-width="1.4" stroke-linecap="round"/>
      <g stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".85"><path d="M36 66 L22 64 M36 69 L23 70"/><path d="M64 66 L78 64 M64 69 L77 70"/></g>`, '#ffd479', '#a86c10'),
    fox: S(`
      <path d="M16 100 Q20 74 50 72 Q80 74 84 100Z" fill="#d86a1f"/>
      <path d="M34 100 Q36 84 50 82 Q64 84 66 100Z" fill="#f6efe6"/>
      <path d="M20 46 L22 10 L44 32Z" fill="#e3772a"/><path d="M22 10 L25 22 L30 19Z" fill="#2a1d16"/><path d="M26 38 L26 22 L38 32Z" fill="#f6e1d0"/>
      <path d="M80 46 L78 10 L56 32Z" fill="#e3772a"/><path d="M78 10 L75 22 L70 19Z" fill="#2a1d16"/><path d="M74 38 L74 22 L62 32Z" fill="#f6e1d0"/>
      <path d="M50 28 C68 28 80 38 80 52 C80 60 72 66 62 72 L50 84 L38 72 C28 66 20 60 20 52 C20 38 32 28 50 28Z" fill="#ec812f"/>
      <path d="M20 54 C26 66 36 72 50 84 C64 72 74 66 80 54 C70 62 60 64 50 64 C40 64 30 62 20 54Z" fill="#fbf4ec"/>
      <path d="M44 30 Q50 44 56 30 Q50 28 44 30Z" fill="#d86a1f"/>
      ${eyeAlmond(38, 50, '#f3b52a', true)}${eyeAlmond(62, 50, '#f3b52a', true)}
      <path d="M45.5 75 Q50 72 54.5 75 Q53 79 50 79 Q47 79 45.5 75Z" fill="#26201c"/>`, '#64b5f6', '#173f86'),
    owl: S(`
      <path d="M26 30 L22 14 L36 24Z" fill="#7a5235"/><path d="M74 30 L78 14 L64 24Z" fill="#7a5235"/>
      <path d="M50 20 C72 20 82 38 82 60 C82 84 68 100 50 100 C32 100 18 84 18 60 C18 38 28 20 50 20Z" fill="#8c6040"/>
      <path d="M36 74 q4 4 8 0 q4 4 8 0 q4 4 8 0 M32 84 q4 4 8 0 q4 4 8 0 q4 4 8 0 q4 4 8 0" fill="none" stroke="#6f4a30" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="50" cy="80" rx="18" ry="18" fill="#c99c70" opacity=".45"/>
      <circle cx="37" cy="48" r="13" fill="#e8cfae"/><circle cx="63" cy="48" r="13" fill="#e8cfae"/>
      <circle cx="37" cy="48" r="8.5" fill="#f29a1e"/><circle cx="37" cy="48" r="5" fill="#161210"/><circle cx="38.8" cy="46.2" r="1.6" fill="#fff"/>
      <circle cx="63" cy="48" r="8.5" fill="#f29a1e"/><circle cx="63" cy="48" r="5" fill="#161210"/><circle cx="64.8" cy="46.2" r="1.6" fill="#fff"/>
      <path d="M46 56 L54 56 L50 66Z" fill="#e6a42b"/>
      <path d="M26 38 Q37 30 48 40 M74 38 Q63 30 52 40" fill="none" stroke="#5c3d26" stroke-width="2.6" stroke-linecap="round"/>`, '#8f7cf7', '#271f68'),
    panda: S(`
      <path d="M14 100 Q18 74 50 72 Q82 74 86 100Z" fill="#232326"/>
      <path d="M38 100 Q40 86 50 84 Q60 86 62 100Z" fill="#f4f4f2"/>
      <circle cx="26" cy="31" r="10" fill="#232326"/><circle cx="74" cy="31" r="10" fill="#232326"/>
      <ellipse cx="50" cy="55" rx="29" ry="27" fill="#f7f7f5"/>
      <path d="M22 62 C24 74 34 82 50 82 C38 78 30 70 27 58Z" fill="#e4e4e0"/>
      <ellipse cx="38" cy="53" rx="7.5" ry="9.5" fill="#232326" transform="rotate(30 38 53)"/><ellipse cx="62" cy="53" rx="7.5" ry="9.5" fill="#232326" transform="rotate(-30 62 53)"/>
      <circle cx="39" cy="52" r="2.6" fill="#fff"/><circle cx="39.6" cy="52.4" r="1.5" fill="#111"/>
      <circle cx="61" cy="52" r="2.6" fill="#fff"/><circle cx="60.4" cy="52.4" r="1.5" fill="#111"/>
      <ellipse cx="50" cy="65" rx="5.2" ry="3.6" fill="#232326"/>
      <path d="M50 68.5 V71 M46 72.5 Q50 75 54 72.5" fill="none" stroke="#55555a" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="32" cy="66" r="3.6" fill="#f6b1b9" opacity=".6"/><circle cx="68" cy="66" r="3.6" fill="#f6b1b9" opacity=".6"/>`, '#a6e07a', '#33702a'),
  };
  for (const k in ART) ART[k] = ART[k].replace('id="g"', 'id="ag' + k + '"').replace('url(#g)', 'url(#ag' + k + ')');
  window.BOT_ART = ART;
})();
