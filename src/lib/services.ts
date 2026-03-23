export type StableServiceStatus = 'on' | 'off' | 'error'

export function getStableServiceStatus(service: Pick<
  Dev5ServiceStatus,
  'status' | 'pid' | 'port_open' | 'http_status_code'
>): StableServiceStatus {
  if (service.status === 'error') {
    return 'error'
  }

  if (service.status === 'on') {
    return 'on'
  }

  if (service.status === 'off') {
    return 'off'
  }

  if (service.pid !== null || service.port_open || service.http_status_code !== null) {
    return 'on'
  }

  return 'off'
}
