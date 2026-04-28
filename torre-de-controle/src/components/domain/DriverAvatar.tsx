import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const statusDot = {
  available:    'bg-[#2ecc71]',
  on_route:     'bg-[#0f62fe]',
  unavailable:  'bg-[#95a5a6]',
} as const

type DriverStatus = keyof typeof statusDot

interface Props {
  name: string
  photoUrl?: string
  status?: DriverStatus
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' }

export function DriverAvatar({ name, photoUrl, status, size = 'md' }: Props) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  return (
    <div className="relative inline-block">
      <Avatar className={sizeMap[size]}>
        {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
        <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">{initials}</AvatarFallback>
      </Avatar>
      {status && (
        <span className={cn(
          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
          statusDot[status],
        )} />
      )}
    </div>
  )
}
