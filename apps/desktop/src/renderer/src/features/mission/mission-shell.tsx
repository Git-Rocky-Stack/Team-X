import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { cn } from '@/lib/utils.js';

type MissionIcon = ComponentType<{ className?: string }>;

interface MissionPageShellProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  contentClassName?: string;
  gridClassName?: string;
}

export function MissionPageShell({
  children,
  className,
  contentClassName,
  gridClassName,
  ...props
}: MissionPageShellProps) {
  return (
    <section
      className={cn('mission-shell relative min-h-full overflow-hidden', className)}
      data-mission-page-shell=""
      {...props}
    >
      <div
        className={cn(
          'mission-grid pointer-events-none absolute inset-0 opacity-35',
          gridClassName,
        )}
      />
      <div className={cn('relative flex min-h-full flex-col gap-6 p-4 lg:p-6', contentClassName)}>
        {children}
      </div>
    </section>
  );
}

interface MissionHeroProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  eyebrow?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  icon?: MissionIcon;
}

export function MissionHero({
  title,
  description,
  eyebrow,
  badge,
  actions,
  meta,
  icon: Icon,
  children,
  className,
  ...props
}: MissionHeroProps) {
  return (
    <header
      className={cn(
        'mission-hero overflow-hidden rounded-[28px] border border-white/10 p-6 lg:p-7',
        className,
      )}
      data-mission-hero=""
      {...props}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          {(eyebrow || badge) && (
            <div className="flex flex-wrap items-center gap-3">
              {eyebrow ? (
                <span className="text-eyebrow text-muted-foreground">{eyebrow}</span>
              ) : null}
              {badge}
            </div>
          )}

          <div className="flex items-start gap-4">
            {Icon ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-black text-brand">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="space-y-2">
                <h1 className="text-display text-foreground">{title}</h1>
                {description ? (
                  <p className="max-w-3xl text-body text-muted-foreground">{description}</p>
                ) : null}
              </div>

              {meta ? <div className="flex flex-wrap gap-3">{meta}</div> : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

interface MissionPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'default' | 'accent' | 'warning' | 'danger';
  mono?: boolean;
  uppercase?: boolean;
}

export function MissionPill({
  tone = 'default',
  mono = false,
  uppercase = false,
  className,
  children,
  ...props
}: MissionPillProps) {
  return (
    <span
      className={cn(
        'mission-pill inline-flex items-center gap-1.5 rounded-full border px-3 py-1 leading-none',
        uppercase ? 'text-eyebrow' : 'text-caption',
        mono && 'font-mono',
        tone === 'accent'
          ? 'border-brand/30 bg-black text-brand'
          : tone === 'warning'
            ? 'border-amber-500/20 bg-black text-amber-300'
            : tone === 'danger'
              ? 'border-red-500/20 bg-black text-red-200'
              : 'border-white/10 bg-black text-muted-foreground',
        className,
      )}
      data-mission-pill=""
      {...props}
    >
      {children}
    </span>
  );
}

interface MissionSectionCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
  headerClassName?: string;
}

export function MissionSectionCard({
  title,
  description,
  badge,
  actions,
  className,
  contentClassName,
  headerClassName,
  children,
  ...props
}: MissionSectionCardProps) {
  const hasHeader = Boolean(title || description || badge || actions);

  return (
    <Card
      className={cn(
        'mission-panel rounded-[24px] border-white/10 bg-transparent shadow-none',
        className,
      )}
      data-mission-section-card=""
      {...props}
    >
      {hasHeader ? (
        <CardHeader
          className={cn('flex flex-row items-start justify-between gap-4 pb-4', headerClassName)}
        >
          <div className="space-y-1">
            {(title || badge) && (
              <div className="flex flex-wrap items-center gap-2">
                {title ? <CardTitle className="text-h3 text-foreground">{title}</CardTitle> : null}
                {badge}
              </div>
            )}
            {description ? (
              <CardDescription className="text-body-sm text-muted-foreground">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions}
        </CardHeader>
      ) : null}

      {children ? (
        <CardContent className={cn('flex flex-col gap-4', contentClassName)}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}

type MissionRailCardProps = MissionSectionCardProps;

export function MissionRailCard({
  className,
  contentClassName,
  headerClassName,
  ...props
}: MissionRailCardProps) {
  return (
    <MissionSectionCard
      className={cn('rounded-[22px]', className)}
      contentClassName={cn('gap-3', contentClassName)}
      headerClassName={cn('pb-3', headerClassName)}
      data-mission-rail-card=""
      {...props}
    />
  );
}

interface MissionControlRowProps extends HTMLAttributes<HTMLDivElement> {
  density?: 'default' | 'compact';
}

export function MissionControlRow({
  density = 'default',
  className,
  children,
  ...props
}: MissionControlRowProps) {
  return (
    <div
      className={cn(
        'mission-control-row flex flex-wrap items-center rounded-[22px] border border-white/10',
        density === 'compact' ? 'gap-1.5 px-2 py-2' : 'gap-2 px-3 py-3',
        className,
      )}
      data-mission-control-row=""
      {...props}
    >
      {children}
    </div>
  );
}

interface MissionSegmentedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  compact?: boolean;
}

export function MissionSegmentedButton({
  active = false,
  compact = false,
  className,
  type = 'button',
  children,
  ...props
}: MissionSegmentedButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'mission-segmented-button rounded-[18px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
        compact ? 'px-3 py-2 text-button-sm' : 'px-3.5 py-2 text-button-sm',
        active
          ? 'border-brand/30 bg-black text-brand shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]'
          : 'border-transparent text-muted-foreground hover:border-white/10 hover:bg-black hover:text-foreground',
        className,
      )}
      data-mission-segmented-button=""
      {...props}
    >
      {children}
    </button>
  );
}

interface MissionIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'accent' | 'warning' | 'danger';
}

export function MissionIconButton({
  tone = 'default',
  className,
  type = 'button',
  children,
  ...props
}: MissionIconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'mission-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        tone === 'accent'
          ? 'border-brand/25 bg-black text-brand hover:bg-black'
          : tone === 'warning'
            ? 'border-amber-500/20 bg-black text-amber-300 hover:bg-black'
            : tone === 'danger'
              ? 'border-red-500/20 bg-black text-red-200 hover:bg-black'
              : 'text-muted-foreground hover:bg-black hover:text-foreground',
        className,
      )}
      data-mission-icon-button=""
      {...props}
    >
      {children}
    </button>
  );
}

interface MissionInsetSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'danger';
}

export function MissionInsetSurface({
  tone = 'default',
  className,
  children,
  ...props
}: MissionInsetSurfaceProps) {
  return (
    <div
      className={cn(
        'mission-inset-surface rounded-[22px] border',
        tone === 'danger' ? 'border-red-500/20 bg-black' : 'border-white/10 bg-black',
        className,
      )}
      data-mission-inset-surface=""
      {...props}
    >
      {children}
    </div>
  );
}

interface MissionSheetHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  badge?: ReactNode;
  icon?: MissionIcon;
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  iconClassName?: string;
}

export function MissionSheetHeader({
  title,
  description,
  eyebrow,
  badge,
  icon: Icon,
  leadingAction,
  trailingAction,
  iconClassName,
  className,
  ...props
}: MissionSheetHeaderProps) {
  return (
    <div
      className={cn('mission-sheet-header border-b border-white/10 px-5 py-5 text-left', className)}
      data-mission-sheet-header=""
      {...props}
    >
      <div className="flex items-start gap-3">
        {leadingAction}
        {Icon ? (
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-brand/25 bg-black text-brand',
              iconClassName,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-eyebrow-sm text-muted-foreground">{eyebrow}</p> : null}
          <div className="mt-1 flex items-center gap-2">
            {title}
            {badge}
          </div>
          {description ? (
            <div className="mt-1 text-body-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {trailingAction}
      </div>
    </div>
  );
}

interface MissionStateBlockProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: MissionIcon;
  tone?: 'default' | 'danger';
}

export function MissionStateBlock({
  title,
  description,
  action,
  icon: Icon,
  tone = 'default',
  className,
  ...props
}: MissionStateBlockProps) {
  return (
    <div
      className={cn(
        'mission-state-block flex flex-col items-center justify-center gap-3 rounded-[24px] border p-8 text-center',
        tone === 'danger'
          ? 'border-red-500/25 bg-black text-red-200'
          : 'border-dashed border-white/10 text-muted-foreground',
        className,
      )}
      data-mission-state-block=""
      {...props}
    >
      {Icon ? (
        <Icon className={cn('h-8 w-8', tone === 'danger' ? 'text-red-300' : 'text-brand')} />
      ) : null}
      <div className="space-y-1">
        <p
          className={cn('text-body-strong', tone === 'danger' ? 'text-red-100' : 'text-foreground')}
        >
          {title}
        </p>
        <p className="max-w-md text-body-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

interface MissionMetricTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  hint?: string;
  icon?: MissionIcon;
  onClick?: () => void;
}

export function MissionMetricTile({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
  className,
  ...props
}: MissionMetricTileProps) {
  const sharedClassName = cn(
    'mission-metric-tile group flex flex-col gap-3 rounded-[22px] border border-white/10 p-4 text-left transition-all',
    onClick && 'hover:border-brand/30 hover:bg-black',
    className,
  );

  const content = (
    <>
      <div className="flex items-center gap-2 text-eyebrow text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4 text-brand" /> : null}
        {label}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-numeric text-foreground">{value}</span>
      </div>
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={sharedClassName}
        data-mission-metric-tile=""
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={sharedClassName} data-mission-metric-tile="" {...props}>
      {content}
    </div>
  );
}
