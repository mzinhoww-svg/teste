/**
 * TCK-008 — Modal: aria-modal, foco preso, Esc e devolução de foco.
 *
 * `userEvent` não está no `package.json` (e `package.json` não é deste
 * ticket), então a tabulação é simulada com `fireEvent.keyDown` — o jsdom não
 * move foco no Tab sozinho, quem move é o handler do trap. Isto é justamente o
 * comportamento sob teste: se o trap não estiver lá, o foco simplesmente não
 * anda e a asserção falha.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal open onClose={onClose} title="Confirmar exclusão" {...props}>
      <p>Esta ação não pode ser desfeita.</p>
    </Modal>,
  );
  return { onClose, ...utils };
}

describe('Modal', () => {
  it('não renderiza nada quando fechado', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Oculto">
        conteúdo
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renderiza como dialog modal nomeado pelo título', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Confirmar exclusão' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('liga a descrição por aria-describedby', () => {
    renderModal({ description: 'Os episódios vinculados também somem.' });
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'Os episódios vinculados também somem.',
    );
  });

  it('não emite aria-describedby sem descrição', () => {
    renderModal();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('aceita role alertdialog para confirmações destrutivas', () => {
    renderModal({ role: 'alertdialog' });
    expect(screen.getByRole('alertdialog', { name: 'Confirmar exclusão' })).toBeInTheDocument();
  });

  it('renderiza em portal no <body>, fora da árvore do gatilho', () => {
    const { container } = renderModal();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  describe('foco', () => {
    it('move o foco para dentro na abertura', () => {
      renderModal();
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('honra initialFocusRef', () => {
      function Harness() {
        const inputRef = useRef<HTMLInputElement>(null);
        return (
          <Modal open onClose={vi.fn()} title="Editar" initialFocusRef={inputRef}>
            <button type="button">Antes</button>
            <input ref={inputRef} aria-label="Título" />
          </Modal>
        );
      }
      render(<Harness />);
      expect(screen.getByLabelText('Título')).toHaveFocus();
    });

    it('devolve o foco ao elemento que abriu quando fecha', () => {
      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <Button onClick={() => setOpen(true)}>Abrir</Button>
            <Modal open={open} onClose={() => setOpen(false)} title="Diálogo">
              corpo
            </Modal>
          </>
        );
      }
      render(<Harness />);

      const trigger = screen.getByRole('button', { name: 'Abrir' });
      trigger.focus();
      fireEvent.click(trigger);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(trigger).not.toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      // O passo mais esquecido: sem isto o usuário de teclado volta ao topo do
      // documento e perde o lugar na página.
      expect(trigger).toHaveFocus();
    });

    it('prende o Tab: do último focável volta para o primeiro', () => {
      render(
        <Modal
          open
          onClose={vi.fn()}
          title="Editar"
          showCloseButton={false}
          footer={<Button>Salvar</Button>}
        >
          <input aria-label="Título" />
        </Modal>,
      );

      const first = screen.getByLabelText('Título');
      const last = screen.getByRole('button', { name: 'Salvar' });

      last.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(first).toHaveFocus();
    });

    it('prende o Shift+Tab: do primeiro focável vai para o último', () => {
      render(
        <Modal
          open
          onClose={vi.fn()}
          title="Editar"
          showCloseButton={false}
          footer={<Button>Salvar</Button>}
        >
          <input aria-label="Título" />
        </Modal>,
      );

      const first = screen.getByLabelText('Título');
      const last = screen.getByRole('button', { name: 'Salvar' });

      first.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
    });

    it('traz o foco de volta se ele escapou do painel', () => {
      render(
        <>
          <button type="button">Fora</button>
          <Modal open onClose={vi.fn()} title="Editar" showCloseButton={false}>
            <input aria-label="Título" />
          </Modal>
        </>,
      );

      screen.getByRole('button', { name: 'Fora' }).focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(screen.getByLabelText('Título')).toHaveFocus();
    });
  });

  describe('fechamento', () => {
    it('fecha com Esc', () => {
      const { onClose } = renderModal();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ignora Esc quando closeOnEscape=false', () => {
      const { onClose } = renderModal({ closeOnEscape: false });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('fecha no clique do overlay', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByTestId('modal-overlay'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ignora o clique do overlay quando closeOnOverlayClick=false', () => {
      const { onClose } = renderModal({ closeOnOverlayClick: false });
      fireEvent.click(screen.getByTestId('modal-overlay'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('não fecha ao clicar dentro do painel', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByText('Esta ação não pode ser desfeita.'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('fecha pelo botão de fechar, que tem nome acessível', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('permite esconder o botão de fechar', () => {
      renderModal({ showCloseButton: false });
      expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
    });
  });

  describe('scroll de fundo', () => {
    it('trava o body enquanto aberto e restaura ao fechar', () => {
      const { unmount } = renderModal();
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('usa shadow-poster como limite acessível do painel', () => {
    // Sombra preta some sobre `surface.base` #000000 no dark; `shadow-poster`
    // embute o hairline `border.strong` e sobrevive aos dois temas.
    renderModal();
    expect(screen.getByRole('dialog').className).toContain('shadow-poster');
  });

  it('renderiza o rodapé com as ações', () => {
    renderModal({ footer: <Button variant="danger">Excluir</Button> });
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });
});
