import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./AvatarCreator.css";

import {
  generateAiAvatar,
} from "../../../../services/avatarService";

/*
|--------------------------------------------------------------------------
| OPTIONS
|--------------------------------------------------------------------------
*/

const GENDER_OPTIONS = [
  {
    id: "female",
    label: "Féminin",
    symbol: "♀",
  },
  {
    id: "male",
    label: "Masculin",
    symbol: "♂",
  },
];

const SKIN_TONES = [
  {
    id: "light",
    label: "Clair",
    value: "#F3C7A5",
  },
  {
    id: "warm",
    label: "Doré",
    value: "#DFA77D",
  },
  {
    id: "medium",
    label: "Moyen",
    value: "#C6865C",
  },
  {
    id: "tan",
    label: "Mat",
    value: "#A86543",
  },
  {
    id: "deep",
    label: "Foncé",
    value: "#70452F",
  },
];

const HAIR_COLORS = [
  {
    id: "black",
    label: "Noir",
    value: "#171717",
  },
  {
    id: "dark-brown",
    label: "Brun foncé",
    value: "#3B2418",
  },
  {
    id: "brown",
    label: "Châtain",
    value: "#70452F",
  },
  {
    id: "auburn",
    label: "Auburn",
    value: "#8A3F2A",
  },
  {
    id: "blonde",
    label: "Blond",
    value: "#D6B46B",
  },
  {
    id: "silver",
    label: "Argent",
    value: "#A8A29E",
  },
];

const HAIR_STYLES = [
  {
    id: "short",
    label: "Court",
    icon: "◖",
    genders: ["female", "male"],
  },
  {
    id: "curly",
    label: "Bouclé",
    icon: "◎",
    genders: ["female", "male"],
  },
  {
    id: "wavy",
    label: "Ondulé",
    icon: "≈",
    genders: ["female", "male"],
  },
  {
    id: "long",
    label: "Long",
    icon: "⟡",
    genders: ["female"],
  },
  {
    id: "bun",
    label: "Chignon",
    icon: "◉",
    genders: ["female"],
  },
  {
    id: "ponytail",
    label: "Queue de cheval",
    icon: "↘",
    genders: ["female"],
  },
  {
    id: "bob",
    label: "Carré",
    icon: "▣",
    genders: ["female"],
  },
  {
    id: "fade",
    label: "Dégradé",
    icon: "▤",
    genders: ["male"],
  },
  {
    id: "side",
    label: "Raie côté",
    icon: "╱",
    genders: ["male"],
  },
  {
    id: "buzz",
    label: "Très court",
    icon: "•",
    genders: ["male"],
  },
];

const FACIAL_HAIR_OPTIONS = [
  {
    id: "none",
    label: "Aucune",
  },
  {
    id: "stubble",
    label: "Barbe légère",
  },
  {
    id: "short-beard",
    label: "Barbe courte",
  },
  {
    id: "beard",
    label: "Barbe",
  },
  {
    id: "mustache",
    label: "Moustache",
  },
];

const GLASSES_OPTIONS = [
  {
    id: "none",
    label: "Sans lunettes",
  },
  {
    id: "round",
    label: "Rondes",
  },
  {
    id: "square",
    label: "Carrées",
  },
  {
    id: "rectangle",
    label: "Rectangulaires",
  },
  {
    id: "oval",
    label: "Ovales",
  },
  {
    id: "cat-eye",
    label: "Cat-eye",
  },
  {
    id: "aviator",
    label: "Aviateur",
  },
  {
    id: "thin-metal",
    label: "Métal fin",
  },
  {
    id: "sunglasses",
    label: "Solaires",
  },
];

const EXPRESSIONS = [
  {
    id: "smile",
    label: "Sourire",
  },
  {
    id: "soft",
    label: "Calme",
  },
  {
    id: "happy",
    label: "Joyeux",
  },
  {
    id: "confident",
    label: "Confiant",
  },
  {
    id: "serious",
    label: "Sérieux",
  },
];

const OUTFIT_STYLES = [
  {
    id: "tshirt",
    label: "T-shirt",
    icon: "T",
    genders: ["female", "male"],
  },
  {
    id: "shirt",
    label: "Chemise",
    icon: "C",
    genders: ["female", "male"],
  },
  {
    id: "suit",
    label: "Costume",
    icon: "V",
    genders: ["female", "male"],
  },
  {
    id: "blazer",
    label: "Blazer",
    icon: "B",
    genders: ["female", "male"],
  },
  {
    id: "hoodie",
    label: "Hoodie",
    icon: "H",
    genders: ["female", "male"],
  },
  {
    id: "turtleneck",
    label: "Col roulé",
    icon: "R",
    genders: ["female", "male"],
  },
  {
    id: "jacket",
    label: "Veste",
    icon: "J",
    genders: ["female", "male"],
  },
  {
    id: "polo",
    label: "Polo",
    icon: "P",
    genders: ["male"],
  },
  {
    id: "blouse",
    label: "Blouse",
    icon: "L",
    genders: ["female"],
  },
  {
    id: "dress",
    label: "Robe",
    icon: "D",
    genders: ["female"],
  },
  {
    id: "cardigan",
    label: "Cardigan",
    icon: "G",
    genders: ["female"],
  },
];

const OUTFIT_COLORS = [
  {
    id: "navy",
    label: "Marine",
    value: "#172554",
  },
  {
    id: "blue",
    label: "Bleu",
    value: "#1D4ED8",
  },
  {
    id: "purple",
    label: "Violet",
    value: "#6D28D9",
  },
  {
    id: "green",
    label: "Vert",
    value: "#047857",
  },
  {
    id: "black",
    label: "Noir",
    value: "#111827",
  },
  {
    id: "gray",
    label: "Gris",
    value: "#475569",
  },
  {
    id: "terracotta",
    label: "Terracotta",
    value: "#B45309",
  },
  {
    id: "rose",
    label: "Rose",
    value: "#BE185D",
  },
  {
    id: "cream",
    label: "Crème",
    value: "#D6C7A1",
  },
];

const OUTFIT_PATTERNS = [
  {
    id: "solid",
    label: "Uni",
    symbol: "■",
  },
  {
    id: "stripes",
    label: "Rayures",
    symbol: "≡",
  },
  {
    id: "dots",
    label: "Pois",
    symbol: "••",
  },
  {
    id: "diagonal",
    label: "Diagonal",
    symbol: "╱",
  },
  {
    id: "geometric",
    label: "Géométrique",
    symbol: "◇",
  },
];

const BACKGROUNDS = [
  {
    id: "blue",
    label: "Bleu",
    value: "#2563EB",
    accent: "#60A5FA",
  },
  {
    id: "indigo",
    label: "Indigo",
    value: "#4338CA",
    accent: "#818CF8",
  },
  {
    id: "violet",
    label: "Violet",
    value: "#7C3AED",
    accent: "#C084FC",
  },
  {
    id: "emerald",
    label: "Émeraude",
    value: "#059669",
    accent: "#34D399",
  },
  {
    id: "rose",
    label: "Rose",
    value: "#DB2777",
    accent: "#F472B6",
  },
  {
    id: "slate",
    label: "Ardoise",
    value: "#334155",
    accent: "#64748B",
  },
  {
    id: "sunset",
    label: "Coucher",
    value: "#EA580C",
    accent: "#F59E0B",
  },
];

const AI_STYLE_PRESETS = [
  {
    id: "professional",
    label: "Professionnel",
    icon: "⌁",
    description:
      "portrait professionnel premium, propre et moderne, adapté à un profil d'entreprise",
  },
  {
    id: "casual",
    label: "Casual",
    icon: "○",
    description:
      "portrait casual moderne, naturel, chaleureux et soigné",
  },
  {
    id: "elegant",
    label: "Élégant",
    icon: "◇",
    description:
      "portrait élégant, chic et sophistiqué avec éclairage doux",
  },
  {
    id: "creative",
    label: "Créatif",
    icon: "✦",
    description:
      "avatar créatif moderne, stylisé, couleurs harmonieuses et finition premium",
  },
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getOption(options, id) {
  return (
    options.find(
      (option) =>
        option.id === id,
    ) || options[0]
  );
}

function getRandomItem(items) {
  return items[
    Math.floor(
      Math.random() * items.length,
    )
  ];
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0).toUpperCase(),
    )
    .join("");
}

function lightenColor(hex, amount = 45) {
  const clean = String(hex || "").replace("#", "");

  if (clean.length !== 6) {
    return "#FFFFFF";
  }

  const number = parseInt(clean, 16);

  const red = Math.min(
    255,
    (number >> 16) + amount,
  );

  const green = Math.min(
    255,
    ((number >> 8) & 0x00ff) + amount,
  );

  const blue = Math.min(
    255,
    (number & 0x0000ff) + amount,
  );

  return `#${(
    (1 << 24) +
    (red << 16) +
    (green << 8) +
    blue
  )
    .toString(16)
    .slice(1)}`;
}

function darkenColor(hex, amount = 35) {
  const clean = String(hex || "").replace("#", "");

  if (clean.length !== 6) {
    return "#000000";
  }

  const number = parseInt(clean, 16);

  const red = Math.max(
    0,
    (number >> 16) - amount,
  );

  const green = Math.max(
    0,
    ((number >> 8) & 0x00ff) - amount,
  );

  const blue = Math.max(
    0,
    (number & 0x0000ff) - amount,
  );

  return `#${(
    (1 << 24) +
    (red << 16) +
    (green << 8) +
    blue
  )
    .toString(16)
    .slice(1)}`;
}

function mimeTypeToExtension(mimeType) {
  switch (String(mimeType || "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";

    case "image/webp":
      return "webp";

    case "image/png":
    default:
      return "png";
  }
}

function base64ToFile(base64, mimeType = "image/png") {
  const cleanBase64 = String(base64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .trim();

  const binary = window.atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] = binary.charCodeAt(index);
  }

  const extension = mimeTypeToExtension(mimeType);

  return new File(
    [bytes],
    `avatar-ai-${Date.now()}.${extension}`,
    {
      type: mimeType,
    },
  );
}

function dataUrlToFile(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;]+);base64,(.+)$/s,
  );

  if (!match) {
    throw new Error(
      "Le format de l'image IA est invalide.",
    );
  }

  return base64ToFile(match[2], match[1]);
}

/*
|--------------------------------------------------------------------------
| AI PROMPT
|--------------------------------------------------------------------------
*/

function buildAiAvatarPrompt(
  settings,
  description,
  presetId,
) {
  const gender = getOption(
    GENDER_OPTIONS,
    settings.gender,
  ).label;

  const skin = getOption(
    SKIN_TONES,
    settings.skin,
  ).label;

  const hairStyle = getOption(
    HAIR_STYLES,
    settings.hairStyle,
  ).label;

  const hairColor = getOption(
    HAIR_COLORS,
    settings.hairColor,
  ).label;

  const glasses = getOption(
    GLASSES_OPTIONS,
    settings.glasses,
  ).label;

  const expression = getOption(
    EXPRESSIONS,
    settings.expression,
  ).label;

  const outfitStyle = getOption(
    OUTFIT_STYLES,
    settings.outfitStyle,
  ).label;

  const outfitColor = getOption(
    OUTFIT_COLORS,
    settings.outfitColor,
  ).label;

  const outfitPattern = getOption(
    OUTFIT_PATTERNS,
    settings.outfitPattern,
  ).label;

  const background = getOption(
    BACKGROUNDS,
    settings.background,
  ).label;

  const facialHair =
    settings.gender === "male"
      ? getOption(
          FACIAL_HAIR_OPTIONS,
          settings.facialHair,
        ).label
      : "Aucune";

  const preset =
    AI_STYLE_PRESETS.find(
      (item) => item.id === presetId,
    ) || AI_STYLE_PRESETS[0];

  const customDescription = String(description || "").trim();

  return [
    "Créer un avatar de profil carré 1:1.",
    "Une seule personne.",
    "Cadrage tête et épaules.",
    `Genre : ${gender}.`,
    `Teint : ${skin}.`,
    `Cheveux : ${hairStyle}, couleur ${hairColor}.`,
    settings.gender === "male"
      ? `Barbe ou moustache : ${facialHair}.`
      : "",
    `Lunettes : ${glasses}.`,
    `Expression : ${expression}.`,
    `Tenue : ${outfitStyle}, couleur ${outfitColor}, motif ${outfitPattern}.`,
    `Arrière-plan : ${background}.`,
    `Direction artistique : ${preset.description}.`,
    customDescription
      ? `Description personnelle prioritaire : ${customDescription}.`
      : "",
    "Visage bien centré.",
    "Style propre, cohérent et flat design premium.",
    "Éclairage propre et flatteur.",
    "Image de profil moderne et professionnelle.",
    "Pas de texte.",
    "Pas de logo.",
    "Pas de watermark.",
    "Pas de deuxième personne.",
  ]
    .filter(Boolean)
    .join(" ");
}

/*
|--------------------------------------------------------------------------
| MINI VISUALS FOR OPTIONS
|--------------------------------------------------------------------------
*/

function HairOptionPreview({ style }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="avatar-creator-mini-svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="36" r="14" fill="#F2C29E" />
      <path
        d="M22 39 Q32 47 42 39"
        fill="none"
        stroke="#A25555"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {style === "long" && (
        <g fill="#334155">
          <path d="M14 58 L18 22 Q22 9 32 9 Q42 9 46 22 L50 58 Q44 56 40 44 L38 28 Q35 23 32 22 Q29 23 26 28 L24 44 Q20 56 14 58 Z" />
          <path d="M18 29 Q23 16 32 16 Q41 16 46 29 Q38 23 32 23 Q26 23 18 29 Z" />
        </g>
      )}

      {style === "bob" && (
        <g fill="#334155">
          <path d="M17 50 L19 22 Q22 12 32 12 Q42 12 45 22 L47 50 Q40 48 37 41 L36 28 Q34 25 32 24 Q30 25 28 28 L27 41 Q24 48 17 50 Z" />
          <path d="M18 27 Q23 16 32 16 Q41 16 46 27 Q40 22 32 22 Q24 22 18 27 Z" />
        </g>
      )}

      {style === "ponytail" && (
        <g fill="#334155">
          <path d="M46 26 Q57 31 54 48 Q51 56 44 58 Q49 50 46 42 Q43 35 44 29 Z" />
          <path d="M18 27 Q21 13 32 13 Q43 13 46 27 Q40 22 32 22 Q24 22 18 27 Z" />
        </g>
      )}

      {style === "bun" && (
        <g fill="#334155">
          <circle cx="32" cy="10" r="8" />
          <path d="M18 28 Q22 14 32 14 Q42 14 46 28 Q40 23 32 23 Q24 23 18 28 Z" />
        </g>
      )}

      {style === "curly" && (
        <g fill="#334155">
          <circle cx="21" cy="20" r="8" />
          <circle cx="31" cy="16" r="9" />
          <circle cx="42" cy="20" r="8" />
          <circle cx="18" cy="29" r="8" />
          <circle cx="46" cy="29" r="8" />
        </g>
      )}

      {style === "wavy" && (
        <g fill="#334155">
          <path d="M17 30 Q19 12 32 12 Q45 12 47 30 Q43 24 38 24 Q35 24 32 27 Q29 24 26 24 Q21 24 17 30 Z" />
          <path d="M17 29 Q18 43 23 49" fill="none" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <path d="M47 29 Q46 43 41 49" fill="none" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}

      {style === "short" && (
        <path d="M18 28 Q21 14 32 14 Q43 14 46 28 Q40 20 32 20 Q24 20 18 28 Z" fill="#334155" />
      )}

      {style === "fade" && (
        <g fill="#334155">
          <path d="M18 29 Q21 15 32 15 Q43 15 46 29 Q39 22 32 22 Q25 22 18 29 Z" />
          <path d="M17 31 Q15 36 16 43" fill="none" stroke="#334155" strokeWidth="4.2" strokeLinecap="round" opacity="0.55" />
          <path d="M47 31 Q49 36 48 43" fill="none" stroke="#334155" strokeWidth="4.2" strokeLinecap="round" opacity="0.55" />
        </g>
      )}

      {style === "side" && (
        <path d="M17 30 Q19 15 33 15 Q44 15 48 27 Q42 24 37 24 Q27 24 17 30 Z" fill="#334155" />
      )}

      {style === "buzz" && (
        <path d="M19 28 Q22 18 32 18 Q42 18 45 28 Q40 24 32 24 Q24 24 19 28 Z" fill="#334155" opacity="0.9" />
      )}
    </svg>
  );
}

function OutfitOptionPreview({ style }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="avatar-creator-mini-svg"
      aria-hidden="true"
    >
      <path d="M10 62 Q12 36 32 34 Q52 36 54 62 Z" fill="#2563EB" />

      {style === "tshirt" && (
        <>
          <path d="M16 37 L23 30 H41 L48 37" fill="#2563EB" />
          <path d="M24 34 Q32 41 40 34" fill="#F8FAFC" />
        </>
      )}

      {style === "shirt" && (
        <>
          <path d="M24 35 L32 43 L40 35 L37 62 H27 Z" fill="#FFFFFF" />
          <path d="M32 43 V62" stroke="#CBD5E1" strokeWidth="2" />
        </>
      )}

      {style === "blouse" && (
        <>
          <path d="M24 35 Q32 44 40 35 L37 62 H27 Z" fill="#FFFFFF" opacity="0.95" />
          <circle cx="32" cy="42" r="2" fill="#CBD5E1" />
        </>
      )}

      {style === "polo" && (
        <>
          <path d="M24 35 L32 42 L40 35" fill="#FFFFFF" />
          <path d="M32 42 V54" stroke="#DBEAFE" strokeWidth="2" />
          <path d="M16 37 L13 46" fill="none" stroke="#1E40AF" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 37 L51 46" fill="none" stroke="#1E40AF" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {["suit", "blazer", "jacket", "cardigan"].includes(style) && (
        <>
          <path d="M18 37 L28 33 L32 42 L24 50 Z" fill="#0F172A" opacity="0.88" />
          <path d="M46 37 L36 33 L32 42 L40 50 Z" fill="#0F172A" opacity="0.88" />
          <path d="M27 33 L32 42 L37 33 Z" fill="#FFFFFF" />
          {style === "jacket" && (
            <path d="M32 43 V58" stroke="#93C5FD" strokeWidth="2.3" strokeLinecap="round" />
          )}
          {style === "cardigan" && (
            <>
              <path d="M32 43 V62" stroke="#E2E8F0" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="32" cy="49" r="1.7" fill="#E2E8F0" />
              <circle cx="32" cy="55" r="1.7" fill="#E2E8F0" />
            </>
          )}
          {style === "suit" && (
            <path d="M29 42 L32 49 L35 42 Z" fill="#0F172A" />
          )}
        </>
      )}

      {style === "hoodie" && (
        <>
          <path d="M20 37 Q24 29 32 29 Q40 29 44 37" fill="none" stroke="#93C5FD" strokeWidth="5" strokeLinecap="round" />
          <path d="M28 40 L27 50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <path d="M36 40 L37 50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <rect x="24" y="50" width="16" height="8" rx="4" fill="#1E3A8A" opacity="0.35" />
        </>
      )}

      {style === "turtleneck" && (
        <rect x="25" y="31" width="14" height="13" rx="4" fill="#1E3A8A" />
      )}

      {style === "dress" && (
        <>
          <path d="M20 62 Q21 44 32 35 Q43 44 44 62 Z" fill="#2563EB" />
          <path d="M24 38 Q27 33 32 33 Q37 33 40 38" fill="#FFFFFF" opacity="0.35" />
        </>
      )}
    </svg>
  );
}

/*
|--------------------------------------------------------------------------
| MANUAL AVATAR - HAIR
|--------------------------------------------------------------------------
*/

function HairShape({
  style,
  color,
  gender,
}) {
  const shade = darkenColor(color, 18);
  const highlight = lightenColor(color, 18);

  if (style === "curly") {
    return (
      <g>
        <g fill={color}>
          <circle cx="164" cy="132" r="38" />
          <circle cx="203" cy="104" r="42" />
          <circle cx="255" cy="94" r="48" />
          <circle cx="307" cy="104" r="42" />
          <circle cx="347" cy="132" r="38" />
          <circle cx="173" cy="172" r="30" />
          <circle cx="339" cy="172" r="30" />
          <circle cx="206" cy="79" r="24" />
          <circle cx="305" cy="79" r="24" />
        </g>
        <path
          d="M177 170 C203 143 230 134 256 134 C282 134 309 143 335 170"
          fill="none"
          stroke={highlight}
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.18"
        />
      </g>
    );
  }

  if (style === "wavy") {
    return (
      <g>
        <path
          d="
            M132 198
            C126 108 178 54 255 54
            C333 54 386 108 380 198
            C366 182 350 170 333 166
            C315 160 295 163 279 154
            C265 147 259 135 249 135
            C237 136 228 148 211 156
            C193 165 170 163 154 176
            C145 182 138 189 132 198
            Z
          "
          fill={color}
        />
        <path
          d="M148 209 C153 245 162 280 178 317"
          fill="none"
          stroke={shade}
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M364 209 C359 245 350 280 334 317"
          fill="none"
          stroke={shade}
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M170 132 C196 111 226 104 255 104 C284 104 315 111 341 132"
          fill="none"
          stroke={highlight}
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.18"
        />
      </g>
    );
  }

  if (style === "long") {
    return (
      <g>
        <path
          d="
            M124 362
            C128 286 132 226 134 180
            C138 95 186 45 255 45
            C327 45 375 93 378 180
            C380 226 384 286 388 362
            C365 353 350 331 343 299
            L330 184
            C309 150 286 135 255 134
            C223 135 201 150 182 184
            L169 299
            C162 331 147 353 124 362
            Z
          "
          fill={color}
        />
        <path
          d="
            M150 196
            C160 122 200 92 255 92
            C310 92 350 122 360 196
            C331 158 298 141 255 141
            C212 141 180 158 150 196
            Z
          "
          fill={shade}
        />
        {gender === "female" && (
          <path
            d="M184 96 C204 82 226 75 255 75 C284 75 309 82 329 96"
            fill="none"
            stroke={highlight}
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.24"
          />
        )}
      </g>
    );
  }

  if (style === "bun") {
    return (
      <g>
        <circle cx="256" cy="57" r="44" fill={shade} />
        <path
          d="
            M136 184
            C139 98 190 62 256 62
            C324 62 374 100 376 184
            C346 149 309 132 256 132
            C203 132 166 149 136 184
            Z
          "
          fill={color}
        />
        <path
          d="M196 85 C212 74 231 69 256 69 C281 69 301 74 316 85"
          fill="none"
          stroke={highlight}
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.22"
        />
      </g>
    );
  }

  if (style === "ponytail") {
    return (
      <g>
        <path
          d="
            M343 162
            C385 172 410 214 407 273
            C404 330 386 366 346 385
            C366 345 370 304 365 264
            C360 223 351 193 343 162
            Z
          "
          fill={shade}
        />
        <path
          d="
            M138 183
            C141 100 190 63 256 63
            C324 63 371 101 374 183
            C340 148 304 133 256 133
            C208 133 172 148 138 183
            Z
          "
          fill={color}
        />
        <path
          d="M184 92 C204 81 227 76 255 76 C285 76 308 81 328 93"
          fill="none"
          stroke={highlight}
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.22"
        />
      </g>
    );
  }

  if (style === "bob") {
    return (
      <g>
        <path
          d="
            M136 298
            L142 174
            C147 94 193 57 256 57
            C321 57 366 95 371 174
            L377 298
            C354 289 338 265 332 235
            L323 173
            C303 146 282 133 256 133
            C230 133 208 146 189 173
            L180 235
            C174 265 159 289 136 298
            Z
          "
          fill={color}
        />
        <path
          d="
            M173 137
            C192 117 221 105 256 105
            C291 105 320 117 339 137
            C314 127 287 122 256 122
            C225 122 198 127 173 137
            Z
          "
          fill={highlight}
          opacity="0.2"
        />
      </g>
    );
  }

  if (style === "fade") {
    return (
      <g>
        <path
          d="
            M148 170
            C152 101 196 70 256 70
            C316 70 360 101 364 170
            C330 136 298 123 256 123
            C214 123 182 136 148 170
            Z
          "
          fill={color}
        />
        <path
          d="M149 171 C141 190 140 214 142 233"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M363 171 C371 190 372 214 370 233"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M193 104 C210 93 231 87 256 87 C281 87 301 93 319 104"
          fill="none"
          stroke={highlight}
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.16"
        />
      </g>
    );
  }

  if (style === "side") {
    return (
      <g>
        <path
          d="
            M144 181
            C147 104 191 67 260 66
            C322 66 357 92 372 144
            C345 124 317 118 286 122
            C250 126 216 146 184 173
            C169 185 155 194 144 181
            Z
          "
          fill={color}
        />
        <path
          d="M277 81 C299 83 319 91 338 108"
          fill="none"
          stroke={highlight}
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.18"
        />
      </g>
    );
  }

  if (style === "buzz") {
    return (
      <g>
        <path
          d="
            M154 166
            C160 105 198 79 256 79
            C314 79 352 105 358 166
            C326 144 295 133 256 133
            C217 133 186 144 154 166
            Z
          "
          fill={color}
          opacity="0.92"
        />
        <path
          d="M203 103 C218 97 236 94 256 94 C276 94 294 97 309 103"
          fill="none"
          stroke={highlight}
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.12"
        />
      </g>
    );
  }

  return (
    <g>
      <path
        d="
          M141 177
          C142 96 188 61 255 61
          C328 61 370 104 371 180
          C344 148 307 130 257 130
          C209 130 172 145 142 177
          Z
        "
        fill={color}
      />
      <path
        d="M181 98 C202 84 226 77 255 77 C284 77 309 84 329 98"
        fill="none"
        stroke={highlight}
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.18"
      />
    </g>
  );
}

/*
|--------------------------------------------------------------------------
| FACIAL HAIR
|--------------------------------------------------------------------------
*/

function FacialHair({
  type,
  color,
}) {
  if (type === "stubble") {
    return (
      <path
        d="
          M204 286
          C214 337 297 344 310 285
          C294 302 277 312 256 313
          C235 312 219 303 204 286
          Z
        "
        fill={color}
        opacity="0.2"
      />
    );
  }

  if (type === "short-beard") {
    return (
      <path
        d="
          M201 283
          C207 322 225 343 256 350
          C287 343 305 322 311 283
          C293 298 277 305 256 306
          C235 305 219 298 201 283
          Z
        "
        fill={color}
        opacity="0.82"
      />
    );
  }

  if (type === "beard") {
    return (
      <path
        d="
          M197 274
          C199 326 219 358 256 369
          C294 359 313 326 315 274
          C298 291 280 301 256 302
          C232 301 214 291 197 274
          Z
        "
        fill={color}
        opacity="0.95"
      />
    );
  }

  if (type === "mustache") {
    return (
      <path
        d="
          M218 279
          C230 266 244 267 256 278
          C268 267 282 266 294 279
          C283 292 270 294 256 284
          C242 294 229 292 218 279
          Z
        "
        fill={color}
      />
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| GLASSES
|--------------------------------------------------------------------------
*/

function Glasses({ type }) {
  const common = {
    fill: "none",
    stroke: "#1F2937",
    strokeWidth: 7,
  };

  if (type === "round") {
    return (
      <g {...common}>
        <circle cx="209" cy="211" r="28" />
        <circle cx="303" cy="211" r="28" />
        <path d="M237 210 H275" />
        <path d="M181 204 L164 197" />
        <path d="M331 204 L348 197" />
      </g>
    );
  }

  if (type === "square") {
    return (
      <g {...common}>
        <rect x="177" y="183" width="63" height="54" rx="13" />
        <rect x="272" y="183" width="63" height="54" rx="13" />
        <path d="M240 207 H272" />
        <path d="M177 199 L160 192" />
        <path d="M335 199 L352 192" />
      </g>
    );
  }

  if (type === "rectangle") {
    return (
      <g {...common}>
        <rect x="174" y="191" width="69" height="42" rx="10" />
        <rect x="269" y="191" width="69" height="42" rx="10" />
        <path d="M243 208 H269" />
        <path d="M174 202 L158 196" />
        <path d="M338 202 L354 196" />
      </g>
    );
  }

  if (type === "oval") {
    return (
      <g {...common}>
        <ellipse cx="209" cy="211" rx="31" ry="23" />
        <ellipse cx="303" cy="211" rx="31" ry="23" />
        <path d="M240 210 H272" />
        <path d="M178 204 L161 198" />
        <path d="M334 204 L351 198" />
      </g>
    );
  }

  if (type === "cat-eye") {
    return (
      <g {...common}>
        <path d="M176 206 C188 181 220 180 241 199 C233 229 194 237 176 206 Z" />
        <path d="M271 199 C292 180 324 181 336 206 C318 237 279 229 271 199 Z" />
        <path d="M241 205 H271" />
        <path d="M178 198 L159 187" />
        <path d="M334 198 L353 187" />
      </g>
    );
  }

  if (type === "aviator") {
    return (
      <g {...common}>
        <path d="M177 193 C195 183 230 184 242 198 C241 229 228 243 207 242 C186 241 176 225 177 193 Z" />
        <path d="M270 198 C282 184 317 183 335 193 C336 225 326 241 305 242 C284 243 271 229 270 198 Z" />
        <path d="M242 204 C251 198 261 198 270 204" />
        <path d="M177 196 L158 190" />
        <path d="M335 196 L354 190" />
      </g>
    );
  }

  if (type === "thin-metal") {
    return (
      <g fill="none" stroke="#475569" strokeWidth="4">
        <circle cx="209" cy="211" r="29" />
        <circle cx="303" cy="211" r="29" />
        <path d="M238 210 H274" />
        <path d="M180 203 L161 196" />
        <path d="M332 203 L351 196" />
      </g>
    );
  }

  if (type === "sunglasses") {
    return (
      <g stroke="#111827" strokeWidth="7">
        <rect x="175" y="187" width="67" height="51" rx="14" fill="#111827" opacity="0.88" />
        <rect x="270" y="187" width="67" height="51" rx="14" fill="#111827" opacity="0.88" />
        <path d="M242 207 H270" fill="none" />
      </g>
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| MANUAL OUTFIT
|--------------------------------------------------------------------------
*/

function OutfitPattern({
  pattern,
  color,
}) {
  const light = lightenColor(color, 70);

  if (pattern === "stripes") {
    return (
      <g stroke={light} strokeWidth="10" opacity="0.24">
        <path d="M110 422 H402" />
        <path d="M100 458 H412" />
        <path d="M94 494 H418" />
      </g>
    );
  }

  if (pattern === "dots") {
    const dots = [
      [145, 425],
      [205, 425],
      [265, 425],
      [325, 425],
      [385, 425],
      [120, 470],
      [180, 470],
      [240, 470],
      [300, 470],
      [360, 470],
      [410, 470],
    ];

    return (
      <g fill={light} opacity="0.28">
        {dots.map(([x, y], index) => (
          <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="7" />
        ))}
      </g>
    );
  }

  if (pattern === "diagonal") {
    return (
      <g stroke={light} strokeWidth="8" opacity="0.24">
        <path d="M100 500 L205 395" />
        <path d="M155 512 L272 395" />
        <path d="M225 512 L342 395" />
        <path d="M295 512 L400 407" />
        <path d="M365 512 L430 447" />
      </g>
    );
  }

  if (pattern === "geometric") {
    return (
      <g fill="none" stroke={light} strokeWidth="6" opacity="0.28">
        <path d="M145 426 L170 451 L145 476 L120 451 Z" />
        <path d="M230 408 L255 433 L230 458 L205 433 Z" />
        <path d="M315 426 L340 451 L315 476 L290 451 Z" />
        <path d="M390 408 L415 433 L390 458 L365 433 Z" />
      </g>
    );
  }

  return null;
}

function Outfit({
  style,
  color,
  pattern,
  gender,
}) {
  const clipId = `outfit-clip-${style}-${gender}`;
  const light = lightenColor(color, 42);
  const shade = darkenColor(color, 30);

  let bodyPath = `
    M82 512
    C92 402 151 353 256 353
    C361 353 420 402 430 512
    Z
  `;

  if (style === "dress") {
    bodyPath = `
      M98 512
      C109 415 165 372 256 361
      C347 372 403 415 414 512
      Z
    `;
  }

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <path d={bodyPath} fill={color} />

      <g clipPath={`url(#${clipId})`}>
        <OutfitPattern pattern={pattern} color={color} />
      </g>

      {style === "tshirt" && (
        <>
          <path d="M126 396 L174 356 H338 L386 396" fill={color} />
          <path d="M207 367 C221 389 241 400 256 400 C271 400 291 389 305 367" fill="none" stroke={light} strokeWidth="18" strokeLinecap="round" opacity="0.35" />
          <path d="M219 366 Q237 391 256 391 Q275 391 293 366" fill="none" stroke="#F8FAFC" strokeWidth="11" strokeLinecap="round" />
        </>
      )}

      {style === "shirt" && (
        <>
          <path d="M215 364 L256 406 L297 364 L283 512 H229 Z" fill="#FFFFFF" opacity="0.96" />
          <path d="M256 407 L256 512" stroke="#CBD5E1" strokeWidth="6" />
          <circle cx="256" cy="431" r="4" fill="#94A3B8" />
          <circle cx="256" cy="459" r="4" fill="#94A3B8" />
          <circle cx="256" cy="487" r="4" fill="#94A3B8" />
          <path d="M164 375 L213 356 L231 389 L196 433 Z" fill={light} opacity="0.42" />
          <path d="M348 375 L299 356 L281 389 L316 433 Z" fill={light} opacity="0.42" />
        </>
      )}

      {style === "blouse" && (
        <>
          <path d="M207 367 Q222 394 256 404 Q290 394 305 367 L293 512 H219 Z" fill="#FFFFFF" opacity="0.86" />
          <path d="M232 377 Q244 390 256 398 Q268 390 280 377" fill="none" stroke="#E2E8F0" strokeWidth="5" strokeLinecap="round" />
          <circle cx="256" cy="430" r="4" fill="#CBD5E1" />
          <circle cx="256" cy="454" r="4" fill="#CBD5E1" />
        </>
      )}

      {style === "polo" && (
        <>
          <path d="M210 364 L256 404 L302 364" fill="#FFFFFF" opacity="0.94" />
          <path d="M256 405 L256 470" stroke="#E2E8F0" strokeWidth="5" />
          <circle cx="256" cy="431" r="4" fill="#CBD5E1" />
          <circle cx="256" cy="452" r="4" fill="#CBD5E1" />
          <path d="M128 402 L112 444" fill="none" stroke={shade} strokeWidth="14" strokeLinecap="round" opacity="0.45" />
          <path d="M384 402 L400 444" fill="none" stroke={shade} strokeWidth="14" strokeLinecap="round" opacity="0.45" />
        </>
      )}

      {style === "suit" && (
        <>
          <path d="M182 376 L238 360 L256 408 L215 470 Z" fill={shade} />
          <path d="M330 376 L274 360 L256 408 L297 470 Z" fill={shade} />
          <path d="M236 362 L256 408 L276 362 Z" fill="#FFFFFF" />
          <path d="M244 406 L256 432 L268 406 Z" fill="#0F172A" opacity="0.9" />
          <rect x="173" y="428" width="25" height="11" rx="5" fill={darkenColor(color, 18)} opacity="0.48" />
          <rect x="314" y="428" width="25" height="11" rx="5" fill={darkenColor(color, 18)} opacity="0.48" />
        </>
      )}

      {style === "blazer" && (
        <>
          <path d="M182 376 L239 362 L256 406 L219 458 Z" fill={shade} opacity="0.92" />
          <path d="M330 376 L273 362 L256 406 L293 458 Z" fill={shade} opacity="0.92" />
          <path d="M239 362 L256 406 L273 362 Z" fill="#FFFFFF" />
          <path d="M210 463 H242" fill="none" stroke={darkenColor(color, 14)} strokeWidth="10" strokeLinecap="round" opacity="0.4" />
          <path d="M302 463 H334" fill="none" stroke={darkenColor(color, 14)} strokeWidth="10" strokeLinecap="round" opacity="0.4" />
        </>
      )}

      {style === "jacket" && (
        <>
          <path d="M173 374 L231 357 L245 397 L223 512 H162 Z" fill={shade} opacity="0.95" />
          <path d="M339 374 L281 357 L267 397 L289 512 H350 Z" fill={shade} opacity="0.95" />
          <path d="M231 357 L256 406 L281 357 Z" fill="#FFFFFF" />
          <path d="M256 405 V512" stroke={light} strokeWidth="7" strokeLinecap="round" opacity="0.55" />
          <circle cx="256" cy="431" r="4" fill={light} />
          <circle cx="256" cy="456" r="4" fill={light} />
        </>
      )}

      {style === "cardigan" && (
        <>
          <path d="M184 375 L236 360 L249 399 L228 512 H171 Z" fill={shade} opacity="0.82" />
          <path d="M328 375 L276 360 L263 399 L284 512 H341 Z" fill={shade} opacity="0.82" />
          <path d="M236 360 L256 403 L276 360 Z" fill="#FFFFFF" opacity="0.96" />
          <path d="M256 402 V512" stroke="#E2E8F0" strokeWidth="6" strokeLinecap="round" />
          <circle cx="256" cy="433" r="4" fill="#CBD5E1" />
          <circle cx="256" cy="460" r="4" fill="#CBD5E1" />
          <circle cx="256" cy="487" r="4" fill="#CBD5E1" />
        </>
      )}

      {style === "hoodie" && (
        <>
          <path d="M177 392 C191 353 221 339 256 339 C291 339 321 353 335 392" fill="none" stroke={light} strokeWidth="24" strokeLinecap="round" />
          <path d="M232 392 L223 462" stroke="#FFFFFF" strokeWidth="5" opacity="0.75" strokeLinecap="round" />
          <path d="M280 392 L289 462" stroke="#FFFFFF" strokeWidth="5" opacity="0.75" strokeLinecap="round" />
          <path d="M214 459 C225 478 243 487 256 487 C269 487 287 478 298 459" fill="none" stroke={darkenColor(color, 10)} strokeWidth="16" strokeLinecap="round" opacity="0.3" />
        </>
      )}

      {style === "turtleneck" && (
        <>
          <rect x="208" y="348" width="96" height="74" rx="24" fill={shade} opacity="0.92" />
          <path d="M220 366 H292" stroke={light} strokeWidth="8" strokeLinecap="round" opacity="0.2" />
        </>
      )}

      {style === "dress" && (
        <>
          <path d="M211 363 Q228 387 256 394 Q284 387 301 363" fill="none" stroke={light} strokeWidth="15" strokeLinecap="round" opacity="0.32" />
          <path d="M212 365 Q229 345 256 345 Q283 345 300 365" fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" opacity="0.48" />
          <path d="M164 401 L141 460" fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" opacity="0.22" />
          <path d="M348 401 L371 460" fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" opacity="0.22" />
        </>
      )}
    </g>
  );
}

/*
|--------------------------------------------------------------------------
| FACE
|--------------------------------------------------------------------------
*/

function FaceShape({
  gender,
  skin,
}) {
  return (
    <path
      d={
        gender === "male"
          ? `
            M151 201
            C153 121 194 89 256 89
            C321 89 360 122 362 201
            L356 268
            C349 327 314 363 256 368
            C198 363 163 327 156 268
            Z
          `
          : `
            M158 201
            C160 126 198 93 256 93
            C314 93 352 126 354 201
            L349 261
            C344 322 310 358 256 363
            C202 358 168 322 163 261
            Z
          `
      }
      fill={skin}
    />
  );
}

/*
|--------------------------------------------------------------------------
| MANUAL AVATAR
|--------------------------------------------------------------------------
*/

function AvatarArtwork({
  settings,
  displayName,
  showInitials,
  exportMode = false,
}) {
  const skin = getOption(SKIN_TONES, settings.skin);
  const hair = getOption(HAIR_COLORS, settings.hairColor);
  const background = getOption(BACKGROUNDS, settings.background);
  const outfit = getOption(OUTFIT_COLORS, settings.outfitColor);
  const initials = getInitials(displayName);

  const prefix = exportMode ? "export" : "preview";
  const backgroundId = `${prefix}-avatar-background`;

  return (
    <>
      <defs>
        <linearGradient id={backgroundId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={background.value} />
          <stop offset="100%" stopColor={background.accent} />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="96" fill={`url(#${backgroundId})`} />

      <circle cx="425" cy="80" r="105" fill="#FFFFFF" opacity="0.08" />
      <circle cx="70" cy="440" r="140" fill="#FFFFFF" opacity="0.06" />

      <Outfit
        style={settings.outfitStyle}
        color={outfit.value}
        pattern={settings.outfitPattern}
        gender={settings.gender}
      />

      <path
        d={
          settings.gender === "male"
            ? `
              M212 320
              L300 320
              L309 388
              C290 405 274 413 256 413
              C238 413 222 405 203 388
              Z
            `
            : `
              M218 321
              L294 321
              L301 385
              C287 402 274 410 256 410
              C238 410 225 402 211 385
              Z
            `
        }
        fill={skin.value}
      />

      <ellipse cx="151" cy="236" rx="26" ry="36" fill={skin.value} />
      <ellipse cx="361" cy="236" rx="26" ry="36" fill={skin.value} />

      <FaceShape gender={settings.gender} skin={skin.value} />

      <HairShape
        style={settings.hairStyle}
        color={hair.value}
        gender={settings.gender}
      />

      <path
        d="M184 190 C201 180 219 180 234 189"
        fill="none"
        stroke={hair.value}
        strokeWidth="7"
        strokeLinecap="round"
      />

      <path
        d="M278 189 C294 180 312 180 328 190"
        fill="none"
        stroke={hair.value}
        strokeWidth="7"
        strokeLinecap="round"
      />

      <ellipse cx="210" cy="215" rx="7" ry="9" fill="#1F2937" />
      <ellipse cx="302" cy="215" rx="7" ry="9" fill="#1F2937" />

      <path
        d="
          M255 218
          C248 243 247 259 255 269
          C261 273 268 272 273 268
        "
        fill="none"
        stroke="#8B5E45"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.55"
      />

      {settings.gender === "male" && (
        <FacialHair type={settings.facialHair} color={hair.value} />
      )}

      {settings.expression === "happy" ? (
        <path
          d="M217 292 C238 318 276 318 297 292"
          fill="#FFFFFF"
          stroke="#923D4D"
          strokeWidth="6"
          strokeLinecap="round"
        />
      ) : settings.expression === "serious" ? (
        <path
          d="M226 299 H286"
          fill="none"
          stroke="#923D4D"
          strokeWidth="6"
          strokeLinecap="round"
        />
      ) : settings.expression === "soft" ? (
        <path
          d="M227 296 C244 302 268 302 285 296"
          fill="none"
          stroke="#923D4D"
          strokeWidth="6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M222 290 C240 307 272 307 290 290"
          fill="none"
          stroke="#923D4D"
          strokeWidth="6"
          strokeLinecap="round"
        />
      )}

      <Glasses type={settings.glasses} />

      {showInitials && initials && (
        <>
          <circle cx="430" cy="430" r="46" fill="#FFFFFF" opacity="0.95" />
          <text
            x="430"
            y="441"
            textAnchor="middle"
            fill={background.value}
            fontFamily="Arial, sans-serif"
            fontSize="30"
            fontWeight="700"
          >
            {initials}
          </text>
        </>
      )}
    </>
  );
}

/*
|--------------------------------------------------------------------------
| SVG -> PNG
|--------------------------------------------------------------------------
*/

async function svgElementToPngFile(svgElement) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgElement);

  if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
    source = source.replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }

  const blob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Impossible de préparer l'image de l'avatar.",
      );
    }

    context.drawImage(image, 0, 0, 512, 512);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(
              new Error(
                "Impossible de générer le PNG.",
              ),
            );
          }
        },
        "image/png",
        1,
      );
    });

    return new File([pngBlob], `avatar-${Date.now()}.png`, {
      type: "image/png",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

function AvatarCreator({
  displayName = "Utilisateur",
  onUseAvatar,
  onGenerateAiAvatar,
  onClose,
}) {
  const exportSvgRef = useRef(null);

  const [settings, setSettings] = useState({
    gender: "female",
    skin: "warm",
    hairStyle: "long",
    hairColor: "black",
    facialHair: "none",
    glasses: "none",
    expression: "smile",
    outfitStyle: "blazer",
    outfitColor: "navy",
    outfitPattern: "solid",
    background: "blue",
  });

  const [showInitials, setShowInitials] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiPreset, setAiPreset] = useState("professional");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiImageUrl, setAiImageUrl] = useState("");
  const [aiFile, setAiFile] = useState(null);
  const [aiPromptVisible, setAiPromptVisible] = useState(false);
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");

  const availableHairStyles = useMemo(
    () =>
      HAIR_STYLES.filter((item) =>
        item.genders.includes(settings.gender),
      ),
    [settings.gender],
  );

  const availableOutfitStyles = useMemo(
    () =>
      OUTFIT_STYLES.filter((item) =>
        item.genders.includes(settings.gender),
      ),
    [settings.gender],
  );

  const aiPrompt = useMemo(
    () => buildAiAvatarPrompt(settings, aiDescription, aiPreset),
    [settings, aiDescription, aiPreset],
  );

  useEffect(() => {
    return () => {
      if (aiImageUrl && aiImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(aiImageUrl);
      }
    };
  }, [aiImageUrl]);

  function clearMessages() {
    setError("");
    setSuccessMessage("");
  }

  function updateSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));

    clearMessages();
  }

  function handleGenderChange(gender) {
    setSettings((current) => {
      const allowedHair = HAIR_STYLES.filter((item) =>
        item.genders.includes(gender),
      );

      const allowedOutfits = OUTFIT_STYLES.filter((item) =>
        item.genders.includes(gender),
      );

      let hairStyle = current.hairStyle;

      if (!allowedHair.some((item) => item.id === hairStyle)) {
        hairStyle = gender === "female" ? "long" : "fade";
      }

      let outfitStyle = current.outfitStyle;

      if (!allowedOutfits.some((item) => item.id === outfitStyle)) {
        outfitStyle = gender === "female" ? "blazer" : "shirt";
      }

      return {
        ...current,
        gender,
        hairStyle,
        outfitStyle,
        facialHair: gender === "female" ? "none" : current.facialHair,
      };
    });

    clearMessages();
  }

  function randomizeAvatar() {
    const gender = getRandomItem(GENDER_OPTIONS).id;

    const allowedHair = HAIR_STYLES.filter((item) =>
      item.genders.includes(gender),
    );

    const allowedOutfits = OUTFIT_STYLES.filter((item) =>
      item.genders.includes(gender),
    );

    setSettings({
      gender,
      skin: getRandomItem(SKIN_TONES).id,
      hairStyle: getRandomItem(allowedHair).id,
      hairColor: getRandomItem(HAIR_COLORS).id,
      facialHair:
        gender === "female"
          ? "none"
          : getRandomItem(FACIAL_HAIR_OPTIONS).id,
      glasses: getRandomItem(GLASSES_OPTIONS).id,
      expression: getRandomItem(EXPRESSIONS).id,
      outfitStyle: getRandomItem(allowedOutfits).id,
      outfitColor: getRandomItem(OUTFIT_COLORS).id,
      outfitPattern: getRandomItem(OUTFIT_PATTERNS).id,
      background: getRandomItem(BACKGROUNDS).id,
    });

    clearAiAvatar(false);
    clearMessages();
  }

  function revokeCurrentBlob() {
    if (aiImageUrl && aiImageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(aiImageUrl);
    }
  }

  function normalizeAiResult(result) {
    if (!result) {
      throw new Error(
        "Le service IA n'a retourné aucune réponse.",
      );
    }

    if (result instanceof File) {
      return {
        file: result,
        url: URL.createObjectURL(result),
        provider: "",
        model: "",
      };
    }

    if (result instanceof Blob) {
      const mimeType = result.type || "image/png";
      const extension = mimeTypeToExtension(mimeType);
      const file = new File([
        result,
      ], `avatar-ai-${Date.now()}.${extension}`, {
        type: mimeType,
      });

      return {
        file,
        url: URL.createObjectURL(file),
        provider: "",
        model: "",
      };
    }

    if (typeof result === "string") {
      return {
        file: null,
        url: result,
        provider: "",
        model: "",
      };
    }

    const payload =
      result?.data && typeof result.data === "object"
        ? result.data
        : result?.response && typeof result.response === "object"
          ? result.response
          : result;

    if (payload?.file instanceof File) {
      return {
        file: payload.file,
        url: payload.url || URL.createObjectURL(payload.file),
        provider: payload.provider || "",
        model: payload.model || "",
      };
    }

    const dataUrl =
      payload?.image_data_url ||
      payload?.imageDataUrl ||
      (typeof payload?.url === "string" &&
      payload.url.startsWith("data:image/")
        ? payload.url
        : "");

    if (dataUrl) {
      const file = dataUrlToFile(dataUrl);

      return {
        file,
        url: dataUrl,
        provider: payload.provider || "",
        model: payload.model || "",
      };
    }

    const imageBase64 =
      payload?.image_base64 || payload?.imageBase64 || "";

    if (imageBase64) {
      const mimeType = payload?.mime_type || payload?.mimeType || "image/png";
      const file = base64ToFile(imageBase64, mimeType);

      return {
        file,
        url: `data:${mimeType};base64,${imageBase64}`,
        provider: payload.provider || "",
        model: payload.model || "",
      };
    }

    if (typeof payload?.url === "string" && payload.url) {
      return {
        file: null,
        url: payload.url,
        provider: payload.provider || "",
        model: payload.model || "",
      };
    }

    throw new Error(
      payload?.message ||
        "Le service IA n'a retourné aucune image.",
    );
  }

  async function handleGenerateAiAvatar() {
    try {
      setAiGenerating(true);
      clearMessages();

      const generator =
        typeof onGenerateAiAvatar === "function"
          ? onGenerateAiAvatar
          : generateAiAvatar;

      const result = await generator({
        prompt: aiPrompt,
        description: aiDescription,
        preset: aiPreset,
        settings: {
          ...settings,
          skinTone: settings.skin,
          backgroundColor: settings.background,
        },
      });

      const normalized = normalizeAiResult(result);

      revokeCurrentBlob();

      setAiFile(normalized.file);
      setAiImageUrl(normalized.url);
      setAiProvider(normalized.provider || "cloudflare");
      setAiModel(normalized.model || "");
      setSuccessMessage(
        "Avatar généré avec succès. Vous pouvez maintenant l'utiliser comme photo de profil.",
      );
    } catch (avatarError) {
      console.error("Avatar AI generation error:", avatarError);
      setError(
        avatarError?.message ||
          "Impossible de générer l'avatar avec l'IA.",
      );
    } finally {
      setAiGenerating(false);
    }
  }

  function clearAiAvatar(clearMessage = true) {
    revokeCurrentBlob();
    setAiImageUrl("");
    setAiFile(null);
    setAiProvider("");
    setAiModel("");

    if (clearMessage) {
      clearMessages();
    }
  }

  async function handleUseAvatar() {
    try {
      setGenerating(true);
      clearMessages();

      let file = aiFile;

      if (!file && aiImageUrl) {
        if (aiImageUrl.startsWith("data:image/")) {
          file = dataUrlToFile(aiImageUrl);
        } else {
          const response = await fetch(aiImageUrl);

          if (!response.ok) {
            throw new Error(
              "Impossible de récupérer l'image IA.",
            );
          }

          const blob = await response.blob();
          const mimeType = blob.type || "image/png";
          const extension = mimeTypeToExtension(mimeType);

          file = new File([
            blob,
          ], `avatar-ai-${Date.now()}.${extension}`, {
            type: mimeType,
          });
        }
      }

      if (!file) {
        const svg = exportSvgRef.current;

        if (!svg) {
          throw new Error(
            "Aperçu de l'avatar introuvable.",
          );
        }

        file = await svgElementToPngFile(svg);
      }

      if (typeof onUseAvatar === "function") {
        await onUseAvatar(file);
      }

      setSuccessMessage("Avatar appliqué avec succès.");
    } catch (avatarError) {
      console.error("Use avatar error:", avatarError);
      setError(
        avatarError?.message ||
          "Impossible d'utiliser cet avatar.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="avatar-creator">
      <header className="avatar-creator-header">
        <div>
          <span className="avatar-creator-eyebrow">
            Avatar studio
          </span>

          <h2>
            Créer mon avatar
          </h2>

          <p>
            Personnalisez votre avatar manuellement ou laissez
            l’IA créer une image à partir de votre description,
            de votre tenue, de votre coiffure et de votre style.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            className="avatar-creator-close"
            onClick={onClose}
            aria-label="Fermer le créateur d'avatar"
          >
            ×
          </button>
        )}
      </header>

      <div className="avatar-creator-layout">
        <aside className="avatar-creator-preview-panel">
          <div className="avatar-creator-preview-top">
            <span className="avatar-creator-section-label">
              Aperçu
            </span>

            <span
              className={
                aiImageUrl
                  ? "avatar-creator-mode-badge avatar-creator-mode-badge--ai"
                  : "avatar-creator-mode-badge"
              }
            >
              {aiImageUrl ? "IA" : "Manuel"}
            </span>
          </div>

          <div className="avatar-creator-preview">
            <div
              className={
                aiGenerating
                  ? "avatar-creator-preview-frame is-generating"
                  : "avatar-creator-preview-frame"
              }
            >
              {aiGenerating ? (
                <div className="avatar-creator-ai-loading">
                  <span className="avatar-creator-ai-loading-orb">
                    ✦
                  </span>

                  <strong>
                    Création en cours
                  </strong>

                  <p>
                    Cloudflare AI prépare votre avatar…
                  </p>

                  <span className="avatar-creator-ai-loading-bar">
                    <span />
                  </span>
                </div>
              ) : aiImageUrl ? (
                <img
                  src={aiImageUrl}
                  alt="Avatar généré par IA"
                  className="avatar-creator-ai-preview-image"
                />
              ) : (
                <svg
                  className="avatar-creator-svg"
                  viewBox="0 0 512 512"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Aperçu de votre avatar"
                >
                  <AvatarArtwork
                    settings={settings}
                    displayName={displayName}
                    showInitials={showInitials}
                  />
                </svg>
              )}
            </div>
          </div>

          <div className="avatar-creator-preview-info">
            <strong>
              {displayName}
            </strong>

            <span>
              {aiImageUrl
                ? "Avatar généré par IA"
                : `${getOption(GENDER_OPTIONS, settings.gender).label} · ${getOption(OUTFIT_STYLES, settings.outfitStyle).label}`}
            </span>
          </div>

          {aiImageUrl && (
            <div className="avatar-creator-ai-meta">
              <span>
                <b>
                  Provider
                </b>
                {aiProvider || "Cloudflare"}
              </span>

              {aiModel && (
                <span>
                  <b>
                    Modèle
                  </b>
                  {aiModel}
                </span>
              )}
            </div>
          )}

          {!aiImageUrl && (
            <label className="avatar-creator-toggle">
              <input
                type="checkbox"
                checked={showInitials}
                onChange={(event) =>
                  setShowInitials(event.target.checked)
                }
              />

              <span className="avatar-creator-toggle-control" />

              <span>
                Afficher mes initiales
              </span>
            </label>
          )}

          <button
            type="button"
            className="avatar-creator-random"
            onClick={randomizeAvatar}
            disabled={aiGenerating || generating}
          >
            <span aria-hidden="true">✦</span>
            Style aléatoire
          </button>

          {aiImageUrl && (
            <button
              type="button"
              className="avatar-creator-random avatar-creator-random--secondary"
              onClick={() => clearAiAvatar()}
              disabled={aiGenerating || generating}
            >
              Revenir à l’avatar manuel
            </button>
          )}

          <div className="avatar-creator-export-svg">
            <svg
              ref={exportSvgRef}
              viewBox="0 0 512 512"
              xmlns="http://www.w3.org/2000/svg"
            >
              <AvatarArtwork
                settings={settings}
                displayName={displayName}
                showInitials={showInitials}
                exportMode
              />
            </svg>
          </div>
        </aside>

        <div className="avatar-creator-editor">
          <section className="avatar-creator-option-group avatar-creator-option-group--ai">
            <div className="avatar-creator-ai-heading">
              <div className="avatar-creator-ai-icon">
                ✦
              </div>

              <div>
                <span className="avatar-creator-ai-kicker">
                  Cloudflare Workers AI
                </span>

                <h3>
                  Générer avec l’IA
                </h3>

                <p>
                  Décrivez la personne que vous souhaitez. Les options
                  sélectionnées plus bas seront automatiquement ajoutées au prompt.
                </p>
              </div>
            </div>

            <div className="avatar-creator-ai-presets">
              {AI_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={aiPreset === preset.id ? "is-selected" : ""}
                  onClick={() => {
                    setAiPreset(preset.id);
                    clearMessages();
                  }}
                  disabled={aiGenerating}
                >
                  <span>{preset.icon}</span>
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="avatar-creator-ai-field">
              <span>
                Description personnalisée
              </span>

              <textarea
                className="avatar-creator-ai-textarea"
                value={aiDescription}
                onChange={(event) => {
                  setAiDescription(event.target.value);
                  clearMessages();
                }}
                placeholder="Ex. Femme de 28 ans, cheveux noirs bouclés, lunettes cat-eye, blazer beige, look professionnel et chaleureux..."
                rows="5"
                disabled={aiGenerating}
              />

              <small>
                Vous pouvez écrire en français. L’IA combinera votre description avec vos choix.
              </small>
            </label>

            <div className="avatar-creator-ai-actions">
              <button
                type="button"
                className="avatar-creator-ai-prompt-toggle"
                onClick={() =>
                  setAiPromptVisible((current) => !current)
                }
              >
                {aiPromptVisible ? "Masquer le prompt" : "Voir le prompt complet"}
              </button>

              <span className="avatar-creator-ai-free-badge">
                Cloudflare AI
              </span>
            </div>

            {aiPromptVisible && (
              <div className="avatar-creator-ai-prompt-preview">
                <span>
                  Prompt envoyé
                </span>

                <p>
                  {aiPrompt}
                </p>
              </div>
            )}

            <button
              type="button"
              className="avatar-creator-ai-generate"
              onClick={handleGenerateAiAvatar}
              disabled={aiGenerating || generating}
            >
              {aiGenerating ? (
                <>
                  <span className="avatar-creator-spinner" />
                  Génération en cours…
                </>
              ) : (
                <>
                  <span aria-hidden="true">✦</span>
                  Générer cet avatar avec l’IA
                </>
              )}
            </button>
          </section>

          <OptionSection number="01" title="Genre" subtitle="Base du personnage">
            <div className="avatar-creator-gender-options">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.gender === option.id ? "is-selected" : ""}
                  onClick={() => handleGenderChange(option.id)}
                >
                  <span className="avatar-creator-gender-icon">
                    {option.symbol}
                  </span>

                  <strong>
                    {option.label}
                  </strong>
                </button>
              ))}
            </div>
          </OptionSection>

          <OptionSection number="02" title="Teint" subtitle="Nuance du visage">
            <div className="avatar-creator-color-options">
              {SKIN_TONES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.skin === option.id ? "is-selected" : ""}
                  onClick={() => updateSetting("skin", option.id)}
                >
                  <span style={{ background: option.value }} />
                  <small>{option.label}</small>
                </button>
              ))}
            </div>
          </OptionSection>

          <OptionSection number="03" title="Coiffure" subtitle="Style et couleur">
            <div className="avatar-creator-hair-grid">
              {availableHairStyles.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.hairStyle === option.id ? "avatar-creator-style-card is-selected" : "avatar-creator-style-card"}
                  onClick={() => updateSetting("hairStyle", option.id)}
                >
                  <span className="avatar-creator-style-card__preview">
                    <HairOptionPreview style={option.id} />
                  </span>

                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>

            <div className="avatar-creator-sub-option">
              <span>
                Couleur des cheveux
              </span>

              <div className="avatar-creator-swatches">
                {HAIR_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    className={settings.hairColor === option.id ? "is-selected" : ""}
                    onClick={() => updateSetting("hairColor", option.id)}
                  >
                    <span style={{ background: option.value }} />
                  </button>
                ))}
              </div>
            </div>
          </OptionSection>

          {settings.gender === "male" && (
            <OptionSection number="04" title="Barbe & moustache" subtitle="Options masculines">
              <div className="avatar-creator-choice-grid avatar-creator-choice-grid--four">
                {FACIAL_HAIR_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={settings.facialHair === option.id ? "is-selected" : ""}
                    onClick={() => updateSetting("facialHair", option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </OptionSection>
          )}

          <OptionSection
            number={settings.gender === "male" ? "05" : "04"}
            title="Lunettes"
            subtitle="Monture et style"
          >
            <div className="avatar-creator-choice-grid avatar-creator-choice-grid--three">
              {GLASSES_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.glasses === option.id ? "is-selected" : ""}
                  onClick={() => updateSetting("glasses", option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </OptionSection>

          <OptionSection
            number={settings.gender === "male" ? "06" : "05"}
            title="Expression"
            subtitle="Attitude du portrait"
          >
            <div className="avatar-creator-choice-grid avatar-creator-choice-grid--three">
              {EXPRESSIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.expression === option.id ? "is-selected" : ""}
                  onClick={() => updateSetting("expression", option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </OptionSection>

          <OptionSection
            number={settings.gender === "male" ? "07" : "06"}
            title="Tenue"
            subtitle={
              settings.gender === "female"
                ? "Styles féminins & mixtes"
                : "Styles masculins & mixtes"
            }
            featured
          >
            <div className="avatar-creator-outfit-grid">
              {availableOutfitStyles.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.outfitStyle === option.id ? "avatar-creator-outfit-card is-selected" : "avatar-creator-outfit-card"}
                  onClick={() => updateSetting("outfitStyle", option.id)}
                >
                  <span className="avatar-creator-outfit-card__preview">
                    <OutfitOptionPreview style={option.id} />
                  </span>

                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>

            <div className="avatar-creator-outfit-section">
              <span className="avatar-creator-outfit-label">Couleur</span>

              <div className="avatar-creator-swatches avatar-creator-swatches--large">
                {OUTFIT_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    className={settings.outfitColor === option.id ? "is-selected" : ""}
                    onClick={() => updateSetting("outfitColor", option.id)}
                  >
                    <span style={{ background: option.value }} />
                  </button>
                ))}
              </div>
            </div>
          </OptionSection>

          <OptionSection
            number={settings.gender === "male" ? "08" : "07"}
            title="Motif"
            subtitle="Finition du vêtement"
          >
            <div className="avatar-creator-pattern-grid">
              {OUTFIT_PATTERNS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.outfitPattern === option.id ? "is-selected" : ""}
                  onClick={() => updateSetting("outfitPattern", option.id)}
                >
                  <span className="avatar-creator-pattern-preview">
                    {option.symbol}
                  </span>

                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </OptionSection>

          <OptionSection
            number={settings.gender === "male" ? "09" : "08"}
            title="Arrière-plan"
            subtitle="Couleur principale"
          >
            <div className="avatar-creator-background-options">
              {BACKGROUNDS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={settings.background === option.id ? "is-selected" : ""}
                  onClick={() => updateSetting("background", option.id)}
                >
                  <span
                    style={{
                      background: `linear-gradient(135deg, ${option.value}, ${option.accent})`,
                    }}
                  />

                  <small>{option.label}</small>
                </button>
              ))}
            </div>
          </OptionSection>
        </div>
      </div>

      {error && (
        <div className="avatar-creator-message avatar-creator-message--error">
          <span>!</span>
          <div>
            <strong>Une erreur est survenue</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {successMessage && !error && (
        <div className="avatar-creator-message avatar-creator-message--success">
          <span>✓</span>
          <div>
            <strong>C’est prêt</strong>
            <p>{successMessage}</p>
          </div>
        </div>
      )}

      <footer className="avatar-creator-footer">
        <div className="avatar-creator-footer-copy">
          <strong>{aiImageUrl ? "Avatar IA prêt" : "Avatar manuel prêt"}</strong>
          <p>
            {aiImageUrl
              ? "L’image générée sera enregistrée comme votre photo de profil."
              : "L’avatar manuel sera exporté en PNG 512 × 512."}
          </p>
        </div>

        <div className="avatar-creator-footer-actions">
          {onClose && (
            <button
              type="button"
              className="avatar-creator-cancel"
              onClick={onClose}
              disabled={generating || aiGenerating}
            >
              Annuler
            </button>
          )}

          <button
            type="button"
            className="avatar-creator-submit"
            onClick={handleUseAvatar}
            disabled={generating || aiGenerating}
          >
            {generating && <span className="avatar-creator-spinner" />}
            {generating ? "Enregistrement…" : "Utiliser cet avatar"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function OptionSection({
  number,
  title,
  subtitle,
  featured = false,
  children,
}) {
  return (
    <section
      className={
        featured
          ? "avatar-creator-option-group avatar-creator-option-group--featured"
          : "avatar-creator-option-group"
      }
    >
      <div className="avatar-creator-option-heading">
        <div>
          <span>{number}</span>
          <h3>{title}</h3>
        </div>

        {subtitle && <small>{subtitle}</small>}
      </div>

      {children}
    </section>
  );
}

export default AvatarCreator;
