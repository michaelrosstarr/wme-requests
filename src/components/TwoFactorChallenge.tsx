import { useEffect, useState } from 'react'
import { Alert, Anchor, Button, Checkbox, PinInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { authClient } from '@/lib/auth-client'

export type TwoFactorMethod = 'securityKey' | 'totp' | 'otp' | 'backup'

const METHOD_LABELS: Record<TwoFactorMethod, string> = {
  securityKey: 'Security key',
  totp: 'App',
  otp: 'Email',
  backup: 'Backup code',
}

type KeyChallenge = Awaited<ReturnType<typeof authClient.securityKeyCeremony.challenge>>

// Second step of password sign-in, shown when /sign-in/email answers with `twoFactorRedirect`.
// `serverMethods` is what the two-factor plugin reported (`totp` only if the app is set up, `otp`
// always); security keys come from our own plugin, so they're discovered by asking for a challenge.
export default function TwoFactorChallenge({
  serverMethods,
  onSuccess,
  onCancel,
}: {
  serverMethods: string[]
  onSuccess: (method: TwoFactorMethod) => void
  onCancel: () => void
}) {
  const [keyChallenge, setKeyChallenge] = useState<KeyChallenge | undefined>(undefined)
  const [method, setMethod] = useState<TwoFactorMethod | null>(null)
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void authClient.securityKeyCeremony.challenge().then(setKeyChallenge)
  }, [])

  const available: TwoFactorMethod[] = [
    ...(keyChallenge ? (['securityKey'] as const) : []),
    ...(serverMethods.includes('totp') ? (['totp'] as const) : []),
    ...(serverMethods.includes('otp') ? (['otp'] as const) : []),
    'backup',
  ]
  // Wait for the security-key lookup before picking a default, so it doesn't flip under the user.
  const active = method ?? (keyChallenge === undefined ? null : available[0])

  function switchMethod(next: TwoFactorMethod) {
    setMethod(next)
    setCode('')
    setError(null)
  }

  async function run(fn: () => Promise<{ error: { message?: string } | null }>, successMethod: TwoFactorMethod) {
    setError(null)
    setLoading(true)
    const { error: verifyError } = await fn()
    setLoading(false)
    if (verifyError) {
      setError(verifyError.message ?? 'Verification failed')
      setCode('')
      return
    }
    onSuccess(successMethod)
  }

  async function handleSecurityKey() {
    if (!keyChallenge) return
    await run(() => authClient.securityKeyCeremony.verify(keyChallenge, trustDevice), 'securityKey')
    // Each challenge is single-use; fetch a fresh one in case the user needs to retry.
    void authClient.securityKeyCeremony.challenge().then(setKeyChallenge)
  }

  async function handleSendOtp() {
    setError(null)
    setLoading(true)
    const { error: sendError } = await authClient.twoFactor.sendOtp()
    setLoading(false)
    if (sendError) {
      setError(sendError.message ?? 'Could not send the code')
      return
    }
    setOtpSent(true)
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault()
    if (active === 'totp') void run(() => authClient.twoFactor.verifyTotp({ code, trustDevice }), 'totp')
    if (active === 'otp') void run(() => authClient.twoFactor.verifyOtp({ code, trustDevice }), 'otp')
    if (active === 'backup') {
      void run(() => authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice }), 'backup')
    }
  }

  const pin = (
    <PinInput
      length={6}
      type="number"
      oneTimeCode
      autoFocus
      value={code}
      onChange={setCode}
      aria-label="Verification code"
    />
  )

  return (
    <Stack>
      <div>
        <Text fw={600}>Two-factor authentication</Text>
        <Text size="sm" c="dimmed">
          Confirm it's you with one of your second factors.
        </Text>
      </div>
      {error && (
        <Alert color="red" title="Verification failed">
          {error}
        </Alert>
      )}
      {active === null ? null : (
        <>
          {available.length > 1 && (
            <SegmentedControl
              fullWidth
              size="xs"
              value={active}
              onChange={(v) => switchMethod(v as TwoFactorMethod)}
              data={available.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
            />
          )}

          {active === 'securityKey' && (
            <>
              <Text size="sm">Insert or tap your security key when your browser asks.</Text>
              <Button fullWidth loading={loading} onClick={handleSecurityKey}>
                Use security key
              </Button>
            </>
          )}

          {active === 'otp' && !otpSent && (
            <>
              <Text size="sm">We'll email a 6-digit code to your account's address.</Text>
              <Button fullWidth loading={loading} onClick={handleSendOtp}>
                Email me a code
              </Button>
            </>
          )}

          {(active === 'totp' || active === 'backup' || (active === 'otp' && otpSent)) && (
            <form onSubmit={handleSubmitCode}>
              <Stack>
                <Text size="sm">
                  {active === 'totp' && 'Enter the 6-digit code from your authenticator app.'}
                  {active === 'otp' && 'Enter the 6-digit code we just emailed you. It expires in 3 minutes.'}
                  {active === 'backup' && 'Enter one of your backup codes. Each code works only once.'}
                </Text>
                {active === 'backup' ? (
                  <TextInput
                    autoFocus
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value)}
                    aria-label="Backup code"
                  />
                ) : (
                  pin
                )}
                <Button type="submit" fullWidth loading={loading} disabled={active !== 'backup' && code.length !== 6}>
                  Verify
                </Button>
                {active === 'otp' && (
                  <Anchor component="button" type="button" size="sm" ta="center" onClick={handleSendOtp}>
                    Send a new code
                  </Anchor>
                )}
              </Stack>
            </form>
          )}

          <Checkbox
            label="Trust this device for 30 days"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.currentTarget.checked)}
          />
        </>
      )}
      <Anchor component="button" type="button" size="sm" ta="center" onClick={onCancel}>
        Back to sign in
      </Anchor>
    </Stack>
  )
}
