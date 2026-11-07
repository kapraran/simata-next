/** Road-sign stickers from the logo, drawn once as SVG symbols and reused with <Sign />. */
export type SignName = "warn" | "round" | "speed" | "diamond" | "info" | "stop" | "sparks";

export function SignSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="s-warn" viewBox="0 0 40 38">
          <path
            d="M20 4 L37 34 H3 Z"
            fill="#0B2A6B"
            transform="translate(0 2.5)"
            stroke="#0B2A6B"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M20 4 L37 34 H3 Z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M20 8 L33.5 32 H6.5 Z"
            fill="#fff"
            stroke="#E8322B"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <rect x="18.4" y="15" width="3.2" height="9" rx="1.6" fill="#0B2A6B" />
          <circle cx="20" cy="27.6" r="1.9" fill="#0B2A6B" />
        </symbol>
        <symbol id="s-round" viewBox="0 0 40 40">
          <circle cx="20" cy="22" r="17.5" fill="#0B2A6B" />
          <circle cx="20" cy="20" r="17.5" fill="#fff" />
          <circle cx="20" cy="20" r="15" fill="#1E5BD8" />
          <g fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
            <path d="M12.2 15.5 A9 9 0 0 1 22 11.2" />
            <path d="M28.6 17.6 A9 9 0 0 1 24.4 27.9" />
            <path d="M17.2 28.6 A9 9 0 0 1 11 20.6" />
          </g>
          <g fill="#fff">
            <path d="M21 7.6 L26 11.6 L20.4 14.4 Z" />
            <path d="M31.4 20.3 L28.5 26.2 L25.6 21.6 Z" />
            <path d="M9.2 23.8 L9.2 17.4 L14.2 19.8 Z" />
          </g>
        </symbol>
        <symbol id="s-speed" viewBox="0 0 40 40">
          <circle cx="20" cy="22" r="17.5" fill="#0B2A6B" />
          <circle cx="20" cy="20" r="17.5" fill="#fff" />
          <circle cx="20" cy="20" r="13.2" fill="#fff" stroke="#E8322B" strokeWidth="4.4" />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontFamily="Fredoka"
            fontWeight="700"
            fontSize="14"
            fill="#0B2A6B"
          >
            50
          </text>
        </symbol>
        <symbol id="s-diamond" viewBox="0 0 40 40">
          <rect
            x="8"
            y="10"
            width="24"
            height="24"
            rx="3"
            transform="rotate(45 20 22)"
            fill="#0B2A6B"
          />
          <rect
            x="7"
            y="7"
            width="26"
            height="26"
            rx="3.5"
            transform="rotate(45 20 20)"
            fill="#fff"
          />
          <rect
            x="12"
            y="12"
            width="16"
            height="16"
            rx="2"
            transform="rotate(45 20 20)"
            fill="#FFD21F"
            stroke="#0B2A6B"
            strokeWidth="1.2"
          />
        </symbol>
        <symbol id="s-info" viewBox="0 0 40 40">
          <rect x="4" y="6.5" width="32" height="32" rx="7" fill="#0B2A6B" />
          <rect x="4" y="4" width="32" height="32" rx="7" fill="#fff" />
          <rect x="7" y="7" width="26" height="26" rx="5" fill="#17A862" />
          <path
            d="M13.5 20.5 l4.2 4.2 l8.8 -9"
            fill="none"
            stroke="#fff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="s-stop" viewBox="0 0 40 40">
          <path
            d="M13 4 H27 L36 13 V27 L27 36 H13 L4 27 V13 Z"
            fill="#0B2A6B"
            transform="translate(0 2.5)"
          />
          <path d="M13 4 H27 L36 13 V27 L27 36 H13 L4 27 V13 Z" fill="#fff" />
          <path d="M14.2 7 H25.8 L33 14.2 V25.8 L25.8 33 H14.2 L7 25.8 V14.2 Z" fill="#E8322B" />
        </symbol>
        <symbol id="s-sparks" viewBox="0 0 40 40">
          <g stroke="#FFD21F" strokeWidth="5" strokeLinecap="round">
            <path d="M24 4 L28 14" />
            <path d="M8 12 L17 18" />
            <path d="M4 28 L14 28" />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}

export function Sign({ name, size = 32 }: { name: SignName; size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`#s-${name}`} />
    </svg>
  );
}

/** The sign trio from the logo, for the app bar. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size * 1.33} height={size} viewBox="0 0 60 44" aria-hidden="true" focusable="false">
      <use href="#s-speed" x="14" y="0" width="26" height="26" />
      <use href="#s-round" x="30" y="14" width="26" height="26" />
      <use href="#s-warn" x="0" y="10" width="32" height="30" />
    </svg>
  );
}
