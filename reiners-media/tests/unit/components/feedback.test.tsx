/** TCK-008 — Alert, Toast e Tooltip. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';

describe('Alert', () => {
  it('usa role="alert" nas variantes urgentes', () => {
    // Interrompe a leitura em curso — certo para "falhou ao salvar".
    render(
      <Alert variant="danger" title="Falha ao salvar">
        Tente novamente.
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
  });

  it('usa role="status" nas variantes informativas', () => {
    // Aguarda a pausa — certo para "rascunho salvo". Usar `alert` para tudo faz
    // o usuário desligar a região inteira.
    render(<Alert variant="success">Rascunho salvo</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Rascunho salvo');
  });

  it.each([
    ['neutral', 'status'],
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'alert'],
    ['danger', 'alert'],
  ] as const)('mapeia a variante %s para role="%s"', (variant, role) => {
    render(<Alert variant={variant}>msg</Alert>);
    expect(screen.getByRole(role)).toHaveAttribute('data-variant', variant);
  });

  it('permite forçar o role', () => {
    render(
      <Alert variant="danger" role="status">
        msg
      </Alert>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('esconde o ícone da árvore de acessibilidade', () => {
    const { container } = render(<Alert variant="info">msg</Alert>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('permite remover o ícone', () => {
    const { container } = render(
      <Alert variant="info" icon={false}>
        msg
      </Alert>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('mostra o botão de dispensar apenas com onDismiss, com nome acessível', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert variant="info">msg</Alert>);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <Alert variant="info" onDismiss={onDismiss}>
        msg
      </Alert>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Harness({ options = {} }: { options?: Parameters<ReturnType<typeof useToast>['toast']>[0] }) {
    const { toast, dismissAll } = useToast();
    return (
      <>
        <Button onClick={() => toast({ title: 'Episódio publicado', ...options })}>Notificar</Button>
        <Button onClick={dismissAll}>Limpar</Button>
      </>
    );
  }

  it('expõe uma região de notificações nomeada', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    // Sem nome, a região não aparece na lista de regiões do leitor de tela.
    expect(screen.getByRole('region', { name: 'Notificações' })).toBeInTheDocument();
  });

  it('enfileira e remove um toast', () => {
    render(
      <ToastProvider duration={0}>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    expect(screen.getByText('Episódio publicado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByText('Episódio publicado')).toBeNull();
  });

  it('herda o role do Alert conforme a variante', () => {
    render(
      <ToastProvider duration={0}>
        <Harness options={{ title: 'Falhou', variant: 'danger' }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
  });

  it('some sozinho depois da duração', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider duration={3000}>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    expect(screen.getByText('Episódio publicado')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Episódio publicado')).toBeNull();
  });

  it('respeita duration=0 (WCAG 2.2 §2.2.1 Timing Adjustable)', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider duration={5000}>
        <Harness options={{ duration: 0 }} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Episódio publicado')).toBeInTheDocument();
  });

  it('substitui o toast quando o id se repete', () => {
    render(
      <ToastProvider duration={0}>
        <Harness options={{ id: 'salvar', title: 'Salvando' }} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));

    expect(screen.getAllByText('Salvando')).toHaveLength(1);
  });

  it('dismissAll limpa a fila', () => {
    render(
      <ToastProvider duration={0}>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(screen.queryByText('Episódio publicado')).toBeNull();
  });

  it('falha alto quando usado fora do provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Tooltip', () => {
  it('abre no hover e fecha ao sair', () => {
    render(
      <Tooltip content="Salvar rascunho">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Salvar' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Salvar rascunho');

    fireEvent.mouseLeave(trigger.parentElement as HTMLElement);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('abre no foco de teclado (tooltip só de mouse é invisível para teclado)', () => {
    render(
      <Tooltip content="Salvar rascunho">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('associa o conteúdo ao gatilho por aria-describedby enquanto aberto', () => {
    render(
      <Tooltip content="Salvar rascunho">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Salvar' });
    expect(trigger).not.toHaveAttribute('aria-describedby');

    fireEvent.focus(trigger);
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });

  it('fecha com Esc sem tirar o foco do gatilho (WCAG 2.2 §1.4.13)', () => {
    render(
      <Tooltip content="Salvar rascunho">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Salvar' });
    // Foco NATIVO (não `fireEvent.focus`) para poder afirmar no fim que o Esc
    // fechou o balão sem roubar o foco do gatilho.
    act(() => {
      trigger.focus();
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('mantém o nome acessível do gatilho (tooltip é descrição, não nome)', () => {
    render(
      <Tooltip content="Salvar rascunho">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('respeita openDelay', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Salvar rascunho" openDelay={300}>
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );

    const wrapper = screen.getByRole('button', { name: 'Salvar' }).parentElement as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('posiciona com propriedades lógicas (i18n-ready, NFR-010)', () => {
    render(
      <Tooltip content="Dica" side="end">
        <Button aria-label="Salvar">S</Button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('tooltip').className).toContain('start-full');
  });
});
