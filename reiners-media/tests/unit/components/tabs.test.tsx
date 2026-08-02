/**
 * TCK-008 — Tabs: navegação por teclado, tabindex itinerante e amarração
 * aba ↔ painel. É aqui que "div que troca conteúdo" vira componente de verdade.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function renderTabs(props: Partial<React.ComponentProps<typeof Tabs>> = {}) {
  return render(
    <Tabs defaultValue="sobre" {...props}>
      <TabsList aria-label="Seções do programa">
        <TabsTrigger value="sobre">Sobre</TabsTrigger>
        <TabsTrigger value="episodios">Episódios</TabsTrigger>
        <TabsTrigger value="equipe">Equipe</TabsTrigger>
      </TabsList>
      <TabsContent value="sobre">Painel sobre</TabsContent>
      <TabsContent value="episodios">Painel episódios</TabsContent>
      <TabsContent value="equipe">Painel equipe</TabsContent>
    </Tabs>,
  );
}

describe('Tabs', () => {
  it('expõe tablist nomeado e as abas', () => {
    renderTabs();
    expect(screen.getByRole('tablist', { name: 'Seções do programa' })).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('marca a aba ativa com aria-selected', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('mostra apenas o painel da aba ativa', () => {
    renderTabs();
    expect(screen.getByText('Painel sobre')).toBeVisible();
    expect(screen.getByText('Painel episódios')).not.toBeVisible();
  });

  it('amarra aba e painel nos dois sentidos', () => {
    renderTabs();
    const tab = screen.getByRole('tab', { name: 'Sobre' });
    const panel = screen.getByRole('tabpanel');

    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('usa tabindex itinerante: o tablist é UMA parada de Tab', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveAttribute('tabindex', '-1');
  });

  it('troca de aba no clique', () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });

    fireEvent.click(screen.getByRole('tab', { name: 'Episódios' }));

    expect(onValueChange).toHaveBeenCalledWith('episodios');
    expect(screen.getByText('Painel episódios')).toBeVisible();
    expect(screen.getByText('Painel sobre')).not.toBeVisible();
  });

  describe('teclado', () => {
    it('ArrowRight move o foco e ativa a próxima aba', () => {
      renderTabs();
      const first = screen.getByRole('tab', { name: 'Sobre' });
      first.focus();

      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

      const second = screen.getByRole('tab', { name: 'Episódios' });
      expect(second).toHaveFocus();
      expect(second).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowLeft circula da primeira para a última', () => {
      renderTabs();
      screen.getByRole('tab', { name: 'Sobre' }).focus();

      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });

      expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveFocus();
    });

    it('Home e End vão aos extremos', () => {
      renderTabs();
      const tablist = screen.getByRole('tablist');

      screen.getByRole('tab', { name: 'Sobre' }).focus();
      fireEvent.keyDown(tablist, { key: 'End' });
      expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveFocus();

      fireEvent.keyDown(tablist, { key: 'Home' });
      expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveFocus();
    });

    it('no modo manual o foco anda sem trocar o painel', () => {
      // Evita disparar N fetches ao atravessar N abas com a seta.
      renderTabs({ activationMode: 'manual' });
      screen.getByRole('tab', { name: 'Sobre' }).focus();

      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

      const second = screen.getByRole('tab', { name: 'Episódios' });
      expect(second).toHaveFocus();
      expect(second).toHaveAttribute('aria-selected', 'false');

      fireEvent.click(second);
      expect(second).toHaveAttribute('aria-selected', 'true');
    });

    it('pula abas desabilitadas na navegação por seta', () => {
      render(
        <Tabs defaultValue="a">
          <TabsList aria-label="Abas">
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b" disabled>
              B
            </TabsTrigger>
            <TabsTrigger value="c">C</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Painel A</TabsContent>
          <TabsContent value="b">Painel B</TabsContent>
          <TabsContent value="c">Painel C</TabsContent>
        </Tabs>,
      );

      screen.getByRole('tab', { name: 'A' }).focus();
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

      expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus();
    });

    it('usa as setas verticais na orientação vertical', () => {
      renderTabs({ orientation: 'vertical' });
      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveAttribute('aria-orientation', 'vertical');

      screen.getByRole('tab', { name: 'Sobre' }).focus();
      fireEvent.keyDown(tablist, { key: 'ArrowDown' });

      expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveFocus();
    });
  });

  it('funciona em modo controlado', () => {
    const onValueChange = vi.fn();
    const { rerender } = renderTabs({ value: 'sobre', onValueChange });

    fireEvent.click(screen.getByRole('tab', { name: 'Equipe' }));

    // Controlado: só o pai decide. Sem o rerender o painel NÃO pode mudar.
    expect(onValueChange).toHaveBeenCalledWith('equipe');
    expect(screen.getByText('Painel sobre')).toBeVisible();

    rerender(
      <Tabs value="equipe" onValueChange={onValueChange}>
        <TabsList aria-label="Seções do programa">
          <TabsTrigger value="sobre">Sobre</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>
        <TabsContent value="sobre">Painel sobre</TabsContent>
        <TabsContent value="equipe">Painel equipe</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('Painel equipe')).toBeVisible();
  });

  it('esconde o painel inativo com atributo E classe', () => {
    // Só o atributo perderia para qualquer utilitário de display no className:
    // `[hidden]{display:none}` vem da folha do agente do usuário.
    renderTabs();
    const hidden = screen.getByText('Painel episódios');
    expect(hidden).toHaveAttribute('hidden');
    expect(hidden.className).toContain('hidden');
  });

  it('lança erro claro fora do provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TabsTrigger value="a">A</TabsTrigger>)).toThrow(/dentro de <Tabs>/);
    spy.mockRestore();
  });
});
