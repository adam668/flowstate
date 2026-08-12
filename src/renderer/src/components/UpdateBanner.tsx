interface UpdateBannerProps {
  version: string
  onRestart: () => void
}

/**
 * Appears only once an update has fully downloaded and is ready to install —
 * no UI at all on the common path (checking, downloading, up to date).
 */
export function UpdateBanner({ version, onRestart }: UpdateBannerProps): JSX.Element {
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-label">Update Ready</span>
      <span className="update-banner-message">Version {version} has been downloaded.</span>
      <button type="button" className="update-banner-action" onClick={onRestart}>
        Restart &amp; Update
      </button>
    </div>
  )
}
