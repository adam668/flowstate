interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
}

/**
 * Minimal, flat error surface. This is error *visibility* — it says what failed
 * and gets out of the way; it is not a retry/recovery system.
 */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps): JSX.Element {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-label">Error</span>
      <span className="error-banner-message">{message}</span>
      {onDismiss && (
        <button type="button" className="error-banner-dismiss" onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  )
}
