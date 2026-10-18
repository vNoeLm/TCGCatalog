import React from 'react';
import { getCountry } from '../lib/countries';

interface CountryFlagProps {
  countryCode?: string | null;
  className?: string;
  showTitle?: boolean;
}

export function CountryFlag({ countryCode = 'HU', className = 'w-4 h-3', showTitle = true }: CountryFlagProps) {
  const code = (countryCode || 'HU').toUpperCase();
  const info = getCountry(code);
  const title = showTitle ? `${info.name} (${code})` : undefined;

  // Render SVG flag based on code
  const renderSvg = () => {
    switch (code) {
      case 'HU': // Hungary: Red, White, Green
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ce2939" />
            <rect width="640" height="160" y="160" fill="#ffffff" />
            <rect width="640" height="160" y="320" fill="#477050" />
          </>
        );
      case 'DE': // Germany: Black, Red, Gold
        return (
          <>
            <rect width="640" height="160" y="0" fill="#000000" />
            <rect width="640" height="160" y="160" fill="#dd0000" />
            <rect width="640" height="160" y="320" fill="#ffce00" />
          </>
        );
      case 'AT': // Austria: Red, White, Red
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ed2939" />
            <rect width="640" height="160" y="160" fill="#ffffff" />
            <rect width="640" height="160" y="320" fill="#ed2939" />
          </>
        );
      case 'FR': // France: Blue, White, Red
        return (
          <>
            <rect width="213.3" height="480" x="0" fill="#002395" />
            <rect width="213.3" height="480" x="213.3" fill="#ffffff" />
            <rect width="213.4" height="480" x="426.6" fill="#ed2939" />
          </>
        );
      case 'IT': // Italy: Green, White, Red
        return (
          <>
            <rect width="213.3" height="480" x="0" fill="#009246" />
            <rect width="213.3" height="480" x="213.3" fill="#ffffff" />
            <rect width="213.4" height="480" x="426.6" fill="#ce2b37" />
          </>
        );
      case 'ES': // Spain: Red, Yellow (double height), Red
        return (
          <>
            <rect width="640" height="120" y="0" fill="#aa151b" />
            <rect width="640" height="240" y="120" fill="#f1bf00" />
            <rect width="640" height="120" y="360" fill="#aa151b" />
          </>
        );
      case 'PL': // Poland: White, Red
        return (
          <>
            <rect width="640" height="240" y="0" fill="#ffffff" />
            <rect width="640" height="240" y="240" fill="#dc143c" />
          </>
        );
      case 'CZ': // Czechia: Blue hoist triangle, White top, Red bottom
        return (
          <>
            <rect width="640" height="240" y="0" fill="#ffffff" />
            <rect width="640" height="240" y="240" fill="#d7141a" />
            <polygon points="0,0 320,240 0,480" fill="#11457e" />
          </>
        );
      case 'SK': // Slovakia: White, Blue, Red
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ffffff" />
            <rect width="640" height="160" y="160" fill="#0b4ea2" />
            <rect width="640" height="160" y="320" fill="#ee1c25" />
          </>
        );
      case 'RO': // Romania: Blue, Yellow, Red
        return (
          <>
            <rect width="213.3" height="480" x="0" fill="#002b7f" />
            <rect width="213.3" height="480" x="213.3" fill="#fcd116" />
            <rect width="213.4" height="480" x="426.6" fill="#ce1126" />
          </>
        );
      case 'NL': // Netherlands: Red, White, Blue
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ae1c28" />
            <rect width="640" height="160" y="160" fill="#ffffff" />
            <rect width="640" height="160" y="320" fill="#21468b" />
          </>
        );
      case 'BE': // Belgium: Black, Yellow, Red
        return (
          <>
            <rect width="213.3" height="480" x="0" fill="#000000" />
            <rect width="213.3" height="480" x="213.3" fill="#ffd90c" />
            <rect width="213.4" height="480" x="426.6" fill="#ed2939" />
          </>
        );
      case 'SE': // Sweden: Blue with yellow Nordic cross
        return (
          <>
            <rect width="640" height="480" fill="#006aa7" />
            <rect width="640" height="96" y="192" fill="#fecc00" />
            <rect width="96" height="480" x="192" fill="#fecc00" />
          </>
        );
      case 'DK': // Denmark: Red with white Nordic cross
        return (
          <>
            <rect width="640" height="480" fill="#c60c30" />
            <rect width="640" height="72" y="204" fill="#ffffff" />
            <rect width="72" height="480" x="192" fill="#ffffff" />
          </>
        );
      case 'FI': // Finland: White with blue Nordic cross
        return (
          <>
            <rect width="640" height="480" fill="#ffffff" />
            <rect width="640" height="106" y="187" fill="#002f6c" />
            <rect width="106" height="480" x="187" fill="#002f6c" />
          </>
        );
      case 'PT': // Portugal: Green and Red
        return (
          <>
            <rect width="256" height="480" x="0" fill="#006600" />
            <rect width="384" height="480" x="256" fill="#ff0000" />
            <circle cx="256" cy="240" r="60" fill="#ffcc00" />
          </>
        );
      case 'IE': // Ireland: Green, White, Orange
        return (
          <>
            <rect width="213.3" height="480" x="0" fill="#169b62" />
            <rect width="213.3" height="480" x="213.3" fill="#ffffff" />
            <rect width="213.4" height="480" x="426.6" fill="#ff883e" />
          </>
        );
      case 'HR': // Croatia: Red, White, Blue
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ff0000" />
            <rect width="640" height="160" y="160" fill="#ffffff" />
            <rect width="640" height="160" y="320" fill="#171796" />
          </>
        );
      case 'SI': // Slovenia: White, Blue, Red
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ffffff" />
            <rect width="640" height="160" y="160" fill="#005ce6" />
            <rect width="640" height="160" y="320" fill="#ed1c24" />
          </>
        );
      case 'BG': // Bulgaria: White, Green, Red
        return (
          <>
            <rect width="640" height="160" y="0" fill="#ffffff" />
            <rect width="640" height="160" y="160" fill="#00966e" />
            <rect width="640" height="160" y="320" fill="#d62612" />
          </>
        );
      case 'CH': // Switzerland: Red with White Swiss cross
        return (
          <>
            <rect width="640" height="480" fill="#d52b1e" />
            <rect width="90" height="260" x="275" y="110" fill="#ffffff" />
            <rect width="260" height="90" x="190" y="195" fill="#ffffff" />
          </>
        );
      case 'GB': // United Kingdom
        return (
          <>
            <rect width="640" height="480" fill="#012169" />
            <path d="M0,0 L640,480 M640,0 L0,480" stroke="#ffffff" strokeWidth="60" />
            <path d="M0,0 L640,480 M640,0 L0,480" stroke="#c8102e" strokeWidth="36" />
            <path d="M320,0 L320,480 M0,240 L640,240" stroke="#ffffff" strokeWidth="100" />
            <path d="M320,0 L320,480 M0,240 L640,240" stroke="#c8102e" strokeWidth="60" />
          </>
        );
      case 'US': // United States
        return (
          <>
            <rect width="640" height="480" fill="#b22234" />
            {[1, 3, 5, 7, 9, 11].map((i) => (
              <rect key={i} width="640" height="37" y={i * 37} fill="#ffffff" />
            ))}
            <rect width="260" height="260" fill="#3c3b6e" />
          </>
        );
      case 'JP': // Japan: White with red circle
        return (
          <>
            <rect width="640" height="480" fill="#ffffff" />
            <circle cx="320" cy="240" r="120" fill="#bc002d" />
          </>
        );
      case 'EU': // European Union: Blue with gold star ring
        return (
          <>
            <rect width="640" height="480" fill="#003399" />
            <circle cx="320" cy="240" r="110" fill="none" stroke="#ffcc00" strokeWidth="16" strokeDasharray="18,39" />
          </>
        );
      default: // Fallback / Worldwide: Modern Globe SVG
        return (
          <>
            <rect width="640" height="480" fill="#1e293b" />
            <circle cx="320" cy="240" r="140" fill="none" stroke="#38bdf8" strokeWidth="24" />
            <ellipse cx="320" cy="240" rx="70" ry="140" fill="none" stroke="#38bdf8" strokeWidth="20" />
            <line x1="180" y1="240" x2="460" y2="240" stroke="#38bdf8" strokeWidth="20" />
            <line x1="205" y1="170" x2="435" y2="170" stroke="#38bdf8" strokeWidth="16" />
            <line x1="205" y1="310" x2="435" y2="310" stroke="#38bdf8" strokeWidth="16" />
          </>
        );
    }
  };

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden rounded-[2px] border border-black/20 shadow-xs ${className}`}
      title={title}
      style={{ verticalAlign: 'middle' }}
    >
      <svg
        viewBox="0 0 640 480"
        className="w-full h-full object-cover"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {renderSvg()}
      </svg>
    </span>
  );
}
