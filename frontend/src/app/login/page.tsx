import { Suspense } from 'react'
import { login, signup } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-16rem)] py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-serif text-center tracking-tight">
            Sign in to TrendScope
          </CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to access fashion intelligence
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense fallback={null}>
            {searchParams.then(({ error, message }) => <Notice error={first(error)} message={first(message)} />)}
          </Suspense>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={6} autoComplete="current-password" required />
              <p className="text-xs text-muted-foreground">New accounts: choose a password of at least 6 characters.</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" formAction={login} className="w-full">Sign In</Button>
              <Button type="submit" formAction={signup} variant="outline" className="w-full">Sign Up</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function Notice({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
  }
  if (message) {
    return <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">{message}</p>
  }
  return null
}
