interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  activeTone?: 'green' | 'dark'
  disabled?: boolean
}

/** Shared accessible switch used by settings and feature-module controls. */
export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  size = 'md',
  activeTone = 'green',
  disabled = false,
}: ToggleSwitchProps) {
  const activeColor = activeTone === 'dark' ? 'bg-gray-900' : 'bg-[#07c160]'
  const buttonSize = size === 'sm' ? 'h-6 w-11' : 'h-7 w-12'
  const knobPosition = size === 'sm'
    ? `absolute top-0.5 left-0.5 ${checked ? 'translate-x-5' : 'translate-x-0'}`
    : `inline-block ${checked ? 'translate-x-6' : 'translate-x-1'}`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${buttonSize} ${checked ? activeColor : 'bg-gray-200'}`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${knobPosition}`} />
    </button>
  )
}
