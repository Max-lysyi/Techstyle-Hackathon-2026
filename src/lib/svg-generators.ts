export function drawJerseySVG(options: {
  width: number;
  height: number;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  showLogos?: boolean;
  blur?: boolean;
}): string {
  const {
    width, height,
    primaryColor = '#D90416',
    secondaryColor = '#1D1D1B',
    accentColor = '#FFCD00',
    showLogos = true,
    blur = false,
  } = options;

  const cx = width / 2;
  const blurFilter = blur
    ? `<filter id="blurFilter"><feGaussianBlur stdDeviation="2.5"/><feComponentTransfer><feFuncA type="linear" slope="0.9"/></feComponentTransfer></filter>`
    : '';
  const applyBlur = blur ? ' filter="url(#blurFilter)"' : '';

  const noiseId = 'fabricNoise';
  const noiseFilter = `
    <filter id="${noiseId}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="42" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.06" />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="overlay" />
    </filter>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    ${blurFilter}
    ${noiseFilter}
    <linearGradient id="jerseyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryColor}" />
      <stop offset="60%" stop-color="${primaryColor}" />
      <stop offset="100%" stop-color="${secondaryColor}" />
    </linearGradient>
    <linearGradient id="sideGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${secondaryColor}" />
      <stop offset="100%" stop-color="${primaryColor}" />
    </linearGradient>
    <clipPath id="jerseyClip">
      <path d="M${cx - 60} ${height * 0.08}
        Q${cx - 30} ${height * 0.04} ${cx} ${height * 0.05}
        Q${cx + 30} ${height * 0.04} ${cx + 60} ${height * 0.08}
        L${width * 0.92} ${height * 0.22}
        L${width * 0.85} ${height * 0.42}
        L${width * 0.72} ${height * 0.35}
        L${width * 0.72} ${height * 0.88}
        Q${width * 0.72} ${height * 0.92} ${width * 0.68} ${height * 0.93}
        L${width * 0.32} ${height * 0.93}
        Q${width * 0.28} ${height * 0.92} ${width * 0.28} ${height * 0.88}
        L${width * 0.28} ${height * 0.35}
        L${width * 0.15} ${height * 0.42}
        L${width * 0.08} ${height * 0.22}
        Z" />
    </clipPath>
  </defs>

  <g${applyBlur}>
    <!-- Jersey body -->
    <g clip-path="url(#jerseyClip)" filter="url(#${noiseId})">
      <!-- Main body gradient -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#jerseyGrad)" />

      <!-- Diagonal stripe pattern -->
      <polygon points="${width * 0.28},${height * 0.25} ${width * 0.72},${height * 0.25} ${width * 0.72},${height * 0.42} ${width * 0.28},${height * 0.42}" fill="${secondaryColor}" opacity="0.3" />

      <!-- Side panels -->
      <rect x="${width * 0.28}" y="${height * 0.35}" width="${width * 0.08}" height="${height * 0.58}" fill="${secondaryColor}" opacity="0.5" />
      <rect x="${width * 0.64}" y="${height * 0.35}" width="${width * 0.08}" height="${height * 0.58}" fill="${secondaryColor}" opacity="0.5" />

      <!-- Collar -->
      <path d="M${cx - 55} ${height * 0.09} Q${cx} ${height * 0.03} ${cx + 55} ${height * 0.09} Q${cx} ${height * 0.12} ${cx - 55} ${height * 0.09}" fill="${secondaryColor}" />
      <path d="M${cx - 48} ${height * 0.095} Q${cx} ${height * 0.045} ${cx + 48} ${height * 0.095} Q${cx} ${height * 0.11} ${cx - 48} ${height * 0.095}" fill="${primaryColor}" opacity="0.7" />

      <!-- Sleeve cuffs -->
      <rect x="${width * 0.08}" y="${height * 0.20}" width="${width * 0.22}" height="${height * 0.03}" fill="${accentColor}" rx="2" />
      <rect x="${width * 0.70}" y="${height * 0.20}" width="${width * 0.22}" height="${height * 0.03}" fill="${accentColor}" rx="2" />

      <!-- Bottom hem accent -->
      <rect x="${width * 0.28}" y="${height * 0.90}" width="${width * 0.44}" height="${height * 0.03}" fill="${accentColor}" rx="2" />
    </g>

    ${showLogos ? `
    <!-- Trident emblem -->
    <g transform="translate(${cx - 18}, ${height * 0.18})">
      <path d="M18 0 L22 8 L28 15 L22 18 L22 30 L25 35 L18 38 L11 35 L14 30 L14 18 L8 15 L14 8 Z" fill="${accentColor}" stroke="${secondaryColor}" stroke-width="0.5" />
      <path d="M18 5 L20 10 L24 14 L20 16 L20 26 L22 29 L18 32 L14 29 L16 26 L16 16 L12 14 L16 10 Z" fill="${primaryColor}" opacity="0.3" />
    </g>

    <!-- Sponsor text placeholder -->
    <g transform="translate(${cx}, ${height * 0.52})">
      <text text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" font-style="italic" fill="${accentColor}" letter-spacing="3">НОВА</text>
      <text text-anchor="middle" y="16" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="white" letter-spacing="2">ПОШТА</text>
    </g>

    <!-- Player number -->
    <g transform="translate(${cx}, ${height * 0.72})">
      <text text-anchor="middle" font-family="Arial Black, sans-serif" font-size="36" font-weight="900" font-style="italic" fill="white" stroke="${secondaryColor}" stroke-width="1">10</text>
    </g>
    ` : ''}
  </g>
</svg>`;
}

export function drawPatternUnwrapSVG(options: {
  width: number;
  height: number;
  fillColor?: string;
  showBleed?: boolean;
  showBlindZones?: boolean;
  textureImage?: string;
}): string {
  const {
    width, height,
    fillColor = '#D90416',
    showBleed = true,
    showBlindZones = true,
  } = options;

  const bleedOffset = showBleed ? 8 : 0;
  const panelGap = 20;

  const frontW = width * 0.3;
  const frontH = height * 0.75;
  const frontX = width * 0.05;
  const frontY = height * 0.12;

  const backW = width * 0.3;
  const backH = height * 0.78;
  const backX = width * 0.38;
  const backY = height * 0.10;

  const sleeveW = width * 0.2;
  const sleeveH = height * 0.45;
  const sleeveX = width * 0.72;
  const sleeve1Y = height * 0.08;
  const sleeve2Y = height * 0.56;

  const blindZonesSvg = showBlindZones ? `
    <!-- Blind zones on Front -->
    <rect x="${frontX + frontW * 0.05}" y="${frontY + frontH * 0.02}" width="${frontW * 0.15}" height="${frontH * 0.3}" fill="#FFA500" opacity="0.15" rx="3" />
    <rect x="${frontX + frontW * 0.80}" y="${frontY + frontH * 0.02}" width="${frontW * 0.15}" height="${frontH * 0.3}" fill="#FFA500" opacity="0.15" rx="3" />
    <text x="${frontX + frontW * 0.12}" y="${frontY + frontH * 0.17}" font-size="6" fill="#FFA500" text-anchor="middle" transform="rotate(-90, ${frontX + frontW * 0.12}, ${frontY + frontH * 0.17})">СЛІПА ЗОНА</text>

    <!-- Blind zones on Back -->
    <rect x="${backX + backW * 0.05}" y="${backY + backH * 0.02}" width="${backW * 0.15}" height="${backH * 0.28}" fill="#FFA500" opacity="0.15" rx="3" />
    <rect x="${backX + backW * 0.80}" y="${backY + backH * 0.02}" width="${backW * 0.15}" height="${backH * 0.28}" fill="#FFA500" opacity="0.15" rx="3" />
  ` : '';

  const bleedSvg = showBleed ? `
    <!-- Bleed marks Front -->
    <rect x="${frontX - bleedOffset}" y="${frontY - bleedOffset}" width="${frontW + bleedOffset * 2}" height="${frontH + bleedOffset * 2}" fill="none" stroke="#E91E63" stroke-width="0.5" stroke-dasharray="4,3" rx="4" />
    <!-- Bleed marks Back -->
    <rect x="${backX - bleedOffset}" y="${backY - bleedOffset}" width="${backW + bleedOffset * 2}" height="${backH + bleedOffset * 2}" fill="none" stroke="#E91E63" stroke-width="0.5" stroke-dasharray="4,3" rx="4" />
    <!-- Bleed marks Sleeves -->
    <rect x="${sleeveX - bleedOffset}" y="${sleeve1Y - bleedOffset}" width="${sleeveW + bleedOffset * 2}" height="${sleeveH + bleedOffset * 2}" fill="none" stroke="#E91E63" stroke-width="0.5" stroke-dasharray="4,3" rx="4" />
    <rect x="${sleeveX - bleedOffset}" y="${sleeve2Y - bleedOffset}" width="${sleeveW + bleedOffset * 2}" height="${sleeveH + bleedOffset * 2}" fill="none" stroke="#E91E63" stroke-width="0.5" stroke-dasharray="4,3" rx="4" />
  ` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <filter id="patternNoise">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" seed="7" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.04" />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="overlay" />
    </filter>
    <linearGradient id="panelFill" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${fillColor}" />
      <stop offset="100%" stop-color="${fillColor}" stop-opacity="0.85" />
    </linearGradient>
    <pattern id="crosshatch" patternUnits="userSpaceOnUse" width="6" height="6">
      <path d="M0 0 L6 6 M6 0 L0 6" stroke="rgba(0,0,0,0.06)" stroke-width="0.5" />
    </pattern>
  </defs>

  <!-- Background grid -->
  <rect width="${width}" height="${height}" fill="#2D2D2D" />
  <rect width="${width}" height="${height}" fill="url(#crosshatch)" />

  <!-- Front Panel (Пілочка) -->
  <g filter="url(#patternNoise)">
    <rect x="${frontX}" y="${frontY}" width="${frontW}" height="${frontH}" fill="url(#panelFill)" rx="6" />
    <rect x="${frontX}" y="${frontY}" width="${frontW}" height="${frontH * 0.08}" fill="rgba(0,0,0,0.2)" rx="6" />
    <rect x="${frontX}" y="${frontY + frontH * 0.08}" width="${frontW}" height="${frontH * 0.04}" fill="rgba(0,0,0,0)" />
    <!-- Collar notch -->
    <path d="M${frontX + frontW * 0.35} ${frontY} Q${frontX + frontW * 0.5} ${frontY + frontH * 0.06} ${frontX + frontW * 0.65} ${frontY}" fill="#2D2D2D" />
  </g>
  <text x="${frontX + frontW / 2}" y="${frontY - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#9CA3AF" font-family="Arial, sans-serif">ПІЛОЧКА</text>

  <!-- Back Panel (Спинка) -->
  <g filter="url(#patternNoise)">
    <rect x="${backX}" y="${backY}" width="${backW}" height="${backH}" fill="url(#panelFill)" rx="6" />
    <rect x="${backX}" y="${backY}" width="${backW}" height="${backH * 0.06}" fill="rgba(0,0,0,0.2)" rx="6" />
    <!-- Collar notch (smaller for back) -->
    <path d="M${backX + backW * 0.40} ${backY} Q${backX + backW * 0.5} ${backY + backH * 0.03} ${backX + backW * 0.60} ${backY}" fill="#2D2D2D" />
  </g>
  <text x="${backX + backW / 2}" y="${backY - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#9CA3AF" font-family="Arial, sans-serif">СПИНКА</text>

  <!-- Right Sleeve (Рукав П) -->
  <g filter="url(#patternNoise)">
    <path d="M${sleeveX} ${sleeve1Y + sleeveH * 0.1}
      L${sleeveX + sleeveW * 0.3} ${sleeve1Y}
      L${sleeveX + sleeveW} ${sleeve1Y}
      L${sleeveX + sleeveW} ${sleeve1Y + sleeveH}
      L${sleeveX} ${sleeve1Y + sleeveH}
      Z" fill="url(#panelFill)" />
  </g>
  <text x="${sleeveX + sleeveW / 2}" y="${sleeve1Y - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#9CA3AF" font-family="Arial, sans-serif">РУКАВ (П)</text>

  <!-- Left Sleeve (Рукав Л) -->
  <g filter="url(#patternNoise)">
    <path d="M${sleeveX} ${sleeve2Y}
      L${sleeveX + sleeveW} ${sleeve2Y}
      L${sleeveX + sleeveW} ${sleeve2Y + sleeveH}
      L${sleeveX} ${sleeve2Y + sleeveH}
      L${sleeveX + sleeveW * 0.3} ${sleeve2Y + sleeveH * 0.9}
      Z" fill="url(#panelFill)" />
  </g>
  <text x="${sleeveX + sleeveW / 2}" y="${sleeve2Y - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#9CA3AF" font-family="Arial, sans-serif">РУКАВ (Л)</text>

  ${bleedSvg}
  ${blindZonesSvg}

  <!-- Dimension annotations -->
  <g fill="none" stroke="#6B7280" stroke-width="0.5">
    <!-- Front width dimension -->
    <line x1="${frontX}" y1="${frontY + frontH + 15}" x2="${frontX + frontW}" y2="${frontY + frontH + 15}" />
    <line x1="${frontX}" y1="${frontY + frontH + 10}" x2="${frontX}" y2="${frontY + frontH + 20}" />
    <line x1="${frontX + frontW}" y1="${frontY + frontH + 10}" x2="${frontX + frontW}" y2="${frontY + frontH + 20}" />
  </g>
  <text x="${frontX + frontW / 2}" y="${frontY + frontH + 25}" text-anchor="middle" font-size="7" fill="#6B7280" font-family="Arial, sans-serif">52 см</text>

  ${showBleed ? `
  <g transform="translate(${width - 85}, ${height - 30})">
    <rect width="80" height="22" rx="4" fill="rgba(233,30,99,0.15)" stroke="#E91E63" stroke-width="0.5" />
    <text x="40" y="14" text-anchor="middle" font-size="7" fill="#E91E63" font-family="Arial, sans-serif">Виліт: 5 мм</text>
  </g>
  ` : ''}

  ${showBlindZones ? `
  <g transform="translate(${width - 175}, ${height - 30})">
    <rect width="80" height="22" rx="4" fill="rgba(255,165,0,0.15)" stroke="#FFA500" stroke-width="0.5" />
    <text x="40" y="14" text-anchor="middle" font-size="7" fill="#FFA500" font-family="Arial, sans-serif">Сліпі зони</text>
  </g>
  ` : ''}
</svg>`;
}

export function drawTridentSVG(size: number = 80): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="tridentGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFD700" />
      <stop offset="100%" stop-color="#DAA520" />
    </linearGradient>
  </defs>
  <g transform="translate(${size * 0.2}, ${size * 0.05}) scale(${size / 130})">
    <!-- Central prong -->
    <path d="M39 0 L43 0 L45 25 L50 18 L52 20 L45 32 L45 75 L50 80 L44 85 L39 85 L33 80 L38 75 L38 32 L31 20 L33 18 L38 25 Z" fill="url(#tridentGold)" />
    <!-- Left prong -->
    <path d="M15 20 L20 15 L25 20 L25 50 L30 55 L25 58 L20 58 L15 55 L20 50 Z" fill="url(#tridentGold)" />
    <!-- Right prong -->
    <path d="M57 20 L62 15 L67 20 L67 50 L72 55 L67 58 L62 58 L57 55 L62 50 Z" fill="url(#tridentGold)" />
    <!-- Base -->
    <path d="M30 80 L52 80 L48 95 L35 95 Z" fill="url(#tridentGold)" />
  </g>
</svg>`;
}

export function drawSponsorLogoSVG(w: number = 120, h: number = 50): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="sponsorGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FF2D2D" />
      <stop offset="100%" stop-color="#CC0000" />
    </linearGradient>
  </defs>
  <rect x="5" y="8" width="${w - 10}" height="${h - 16}" rx="6" fill="url(#sponsorGrad)" />
  <text x="${w / 2}" y="${h / 2 - 2}" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="14" font-weight="900" font-style="italic" fill="white" letter-spacing="2">НОВА</text>
  <text x="${w / 2}" y="${h / 2 + 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="rgba(255,255,255,0.9)" letter-spacing="3">ПОШТА</text>
</svg>`;
}

export function drawNumberSVG(num: string = '10', size: number = 80): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="numGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#E0E0E0" />
    </linearGradient>
  </defs>
  <text x="${size / 2}" y="${size * 0.72}" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="${size * 0.65}" font-weight="900" font-style="italic" fill="url(#numGrad)" stroke="#1D1D1B" stroke-width="2">${num}</text>
</svg>`;
}

export function drawBackgroundTextureSVG(w: number, h: number, color: string = '#D90416'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bgTexGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="50%" stop-color="${color}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0.8" />
    </linearGradient>
    <filter id="bgNoise">
      <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="5" seed="42"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.05"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="overlay"/>
    </filter>
    <pattern id="diagStripes" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(-45)">
      <rect width="8" height="20" fill="rgba(0,0,0,0.08)" />
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgTexGrad)" filter="url(#bgNoise)" />
  <rect width="${w}" height="${h}" fill="url(#diagStripes)" />

  <!-- Simulated inpainted areas (where logos were) -->
  <g opacity="0.12">
    <rect x="${w * 0.35}" y="${h * 0.15}" width="${w * 0.3}" height="${w * 0.22}" rx="4" fill="${color}" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" stroke-dasharray="3,2" />
    <text x="${w * 0.5}" y="${h * 0.15 + w * 0.13}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.5)" font-family="Arial, sans-serif">Зона інпейнтингу</text>
  </g>
  <g opacity="0.12">
    <rect x="${w * 0.30}" y="${h * 0.50}" width="${w * 0.4}" height="${w * 0.12}" rx="4" fill="${color}" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" stroke-dasharray="3,2" />
  </g>
</svg>`;
}
