const images = {
  brand: 'no-te.png',
  dashboard: 'dashboard.png',
  projects: 'projects.png',
  documentation: 'documentation.png',
}

export default function AppIcon({ name, size = 32, className = '' }) {
  return (
    <img
      className={`app-icon ${className}`.trim()}
      src={`${import.meta.env.BASE_URL}branding/${images[name]}`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
