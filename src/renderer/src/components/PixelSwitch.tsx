interface Props {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

export function PixelSwitch({ checked, disabled, onCheckedChange }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="pixel-switch" onClick={() => onCheckedChange(!checked)}>
      <span />
    </button>
  )
}
