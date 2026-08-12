# Releasing FlowState

1. Bump the version and create a tag:
   ```bash
   npm version patch   # or: minor / major
   ```
2. Push the commit and the tag:
   ```bash
   git push && git push --tags
   ```
3. GitHub Actions builds the Windows and Mac installers and publishes a new
   GitHub Release automatically. Watch progress at
   https://github.com/adam668/flowstate/actions
4. Once the release is published, friends' already-installed apps detect and
   download the update automatically on their next launch. For a first
   install, send them the Releases page:
   https://github.com/adam668/flowstate/releases
