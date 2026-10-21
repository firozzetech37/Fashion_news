export const PRIMARY_LINKS = [
  { href: "/trending", label: "Trending" },
  { href: "/news", label: "News" },
  { href: "/radar", label: "Radar" },
  { href: "/fashion", label: "Fashion" },
  { href: "/bollywood", label: "Bollywood" },
  { href: "/hollywood", label: "Hollywood" },
  { href: "/celebrities", label: "Celebrities" },
  { href: "/brands", label: "Brands" },
  { href: "/runway", label: "Runway" },
  { href: "/analytics", label: "Analytics" },
  { href: "/forecast", label: "Forecast" },
]

export const ALL_LINKS = [
  { href: "/", label: "Home" },
  ...PRIMARY_LINKS.slice(0, 2),
  { href: "/emerging", label: "Emerging" },
  ...PRIMARY_LINKS.slice(2),
  { href: "/ask", label: "Ask TrendScope" },
  { href: "/search", label: "Search" },
]
