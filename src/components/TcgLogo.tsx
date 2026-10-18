import React from 'react';

interface TcgLogoProps {
  className?: string;
  size?: number;
}

export function TcgLogo({ className = 'w-6 h-6', size }: TcgLogoProps) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="TCG XChange"
    >
      <defs>
        <linearGradient id="navCardCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="navCardGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="navXGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Left Card (Tilted -16 deg) - Cyan Trading Card */}
      <g transform="translate(256, 256) rotate(-16) translate(-256, -256)">
        <rect x="156" y="96" width="200" height="290" rx="18" fill="url(#navCardCyan)" stroke="#38bdf8" strokeWidth="4" />
        <rect x="168" y="108" width="176" height="266" rx="12" fill="#082f49" />
        <rect x="178" y="120" width="156" height="135" rx="8" fill="#0284c7" fillOpacity="0.4" />
      </g>

      {/* Right Card (Tilted +16 deg) - Gold Trading Card */}
      <g transform="translate(256, 256) rotate(16) translate(-256, -256)">
        <rect x="156" y="126" width="200" height="290" rx="18" fill="url(#navCardGold)" stroke="#fef08a" strokeWidth="4" />
        <rect x="168" y="138" width="176" height="266" rx="12" fill="#451a03" />
        <rect x="178" y="150" width="156" height="135" rx="8" fill="#f59e0b" fillOpacity="0.4" />
      </g>

      {/* Center Hextech / Exchange Badge */}
      <circle cx="256" cy="256" r="70" fill="#090d16" stroke="url(#navCardGold)" strokeWidth="6" />

      {/* Sharp Bold Exchange "X" */}
      <path
        d="M 224 208 L 256 244 L 288 208 L 310 208 L 270 256 L 312 304 L 290 304 L 256 266 L 222 304 L 200 304 L 242 256 L 202 208 Z"
        fill="url(#navXGrad)"
        stroke="#ffffff"
        strokeWidth="1.5"
      />
    </svg>
  );
}
