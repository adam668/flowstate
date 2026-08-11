import type { FlowStateApi } from './index'

declare global {
  interface Window {
    api: FlowStateApi
  }
}
