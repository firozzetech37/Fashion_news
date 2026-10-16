import Link from "next/link"
import { Lock } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Shown on admin pages when the API says the visitor isn't a signed-in admin. */
export function AdminRequired({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock className="size-5" /> Admin sign-in required</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={buttonVariants()}>Sign in</Link>
      </CardContent>
    </Card>
  )
}
