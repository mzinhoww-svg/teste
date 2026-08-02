/**
 * TCK-008 — Superfície pública da biblioteca de componentes base.
 *
 * Consumo (TCK-009, TCK-011..019):
 *
 *     import { Button, Card, FormField, Input } from '@/components/ui';
 *
 * Regras de uso do design system, em uma linha cada:
 *   - só tokens semânticos nas classes (`bg-surface-raised`, nunca `bg-zinc-900`);
 *   - nenhum hex fora de `src/lib/tokens.ts`;
 *   - limite de componente = `border-line-default` ou `shadow-raised`, jamais
 *     `border-line-subtle` sozinho (decorativo, ~1.1:1);
 *   - movimento por transição CSS com tokens de motion; o sistema de animação
 *     é do TCK-010.
 *
 * `tests/unit/components/design-system.test.ts` falha se alguma dessas regras
 * for quebrada dentro de `src/components/ui/`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER vs CLIENT (App Router)
 * ─────────────────────────────────────────────────────────────────────────────
 * Continuam renderizáveis em SERVER COMPONENT (sem `'use client'`, zero JS no
 * cliente): `Card` e derivados, `Badge`, `Skeleton`, `Spinner`. Importantes
 * para a landing (TCK-011/012) e o grid de portfólio (TCK-013), que são
 * majoritariamente estáticos.
 *
 * São CLIENT COMPONENTS: `Button`, `Input`, `Textarea`, `Select`, `Label`,
 * `FormField`, `Modal`/`Dialog`, `Tabs`, `Tooltip`, `Alert`, `ToastProvider`.
 * Usá-los dentro de um Server Component funciona; o que NÃO funciona é um
 * Server Component passar `onClick`/`onChange` para eles — essa página (ou o
 * trecho dela) precisa ser `'use client'`.
 */

export { cn } from './cn';
export {
  controlSurface,
  controlTransition,
  disabledControl,
  focusRing,
  invalidControl,
  joinIds,
} from './styles';

export { Alert, alertVariants, type AlertProps, type AlertVariant } from './alert';
export { Avatar, avatarVariants, getInitials, type AvatarProps } from './avatar';
export {
  Badge,
  badgeVariants,
  type BadgeProps,
  type BadgeVariant,
} from './badge';
export {
  Button,
  buttonVariants,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
  type CardProps,
  type CardTitleElement,
  type CardTitleProps,
} from './card';
export {
  FormField,
  useControlA11y,
  useFormFieldContext,
  type ControlA11yInput,
  type ControlA11yProps,
  type FormFieldContextValue,
  type FormFieldProps,
} from './form-field';
export { Input, inputVariants, parseAriaBoolean, type InputProps } from './input';
export { Label, type LabelProps } from './label';
export {
  Dialog,
  Modal,
  type DialogProps,
  type ModalProps,
  type ModalSize,
} from './modal';
export { Select, selectVariants, type SelectProps } from './select';
export { Skeleton, skeletonVariants, type SkeletonProps } from './skeleton';
export { Spinner, type SpinnerProps } from './spinner';
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsActivationMode,
  type TabsContentProps,
  type TabsListProps,
  type TabsOrientation,
  type TabsProps,
  type TabsTriggerProps,
} from './tabs';
export { Textarea, textareaVariants, type TextareaProps } from './textarea';
export {
  ToastProvider,
  useToast,
  type ToastContextValue,
  type ToastOptions,
  type ToastProviderProps,
  type ToastRecord,
} from './toast';
export { Tooltip, type TooltipProps, type TooltipSide } from './tooltip';
