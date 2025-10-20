import * as React from 'react';
import clsx from 'clsx';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  const v = {
    default:   'bg-zinc-900 text-white border border-zinc-700 hover:bg-zinc-800',
    secondary: 'bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700',
    ghost:     'bg-transparent text-white border border-transparent hover:bg-zinc-900/30',
    outline:   'bg-transparent text-foreground border border-border hover:bg-muted',
  }[variant];

  const s = {
    sm: 'px-3 py-1.5 text-sm rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-5 py-3 text-base rounded-lg',
  }[size];

  return <button className={clsx('inline-flex items-center gap-2', v, s, className)} {...props} />;
}