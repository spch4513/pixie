import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible name and tooltip text. */
  label: string;
  /** Visible caption under the icon (dock buttons); tooltip-only when omitted. */
  caption?: string;
  tooltipSide?: 'top' | 'bottom';
  variant?: 'glass' | 'dock' | 'dock-inverted';
}

export function IconButton({ icon, label, caption, tooltipSide = 'bottom', variant = 'glass', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={caption ? undefined : label}
      data-tip-side={tooltipSide}
      className={`icon-btn icon-btn--${variant} ${className}`}
      {...rest}
    >
      <span className="icon-btn-face">
        <Icon name={icon} />
      </span>
      {caption ? (
        <span className="icon-btn-caption" aria-hidden="true">
          {caption}
        </span>
      ) : null}
    </button>
  );
}
