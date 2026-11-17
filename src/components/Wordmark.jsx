export default function Wordmark({ className = '' }) {
  return (
    <span
      className={`no-te-wordmark ${className}`.trim()}
      role="img"
      aria-label="no-te"
      style={{ '--wordmark-image': `url("${import.meta.env.BASE_URL}branding/no-te-wordmark.svg")` }}
    />
  )
}
