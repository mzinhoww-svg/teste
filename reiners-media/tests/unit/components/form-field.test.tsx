/**
 * TCK-008 — FormField: a amarração automática rótulo ↔ controle ↔ erro.
 *
 * Estes testes existem porque o modo de falha é silencioso: um formulário com
 * mensagem de erro vermelha na tela e `aria-describedby` faltando parece
 * perfeito no navegador e é inutilizável no leitor de tela.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

describe('FormField', () => {
  it('associa o rótulo ao controle sem que o autor escreva id', () => {
    render(
      <FormField label="Título do episódio">
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText('Título do episódio')).toBeInstanceOf(HTMLInputElement);
  });

  it('liga a mensagem de erro ao controle por aria-describedby', () => {
    render(
      <FormField label="Título" error="Informe um título">
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText('Título');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const errorNode = document.getElementById(describedBy ?? '');
    expect(errorNode).toHaveTextContent('Informe um título');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('anuncia o erro com role="alert"', () => {
    render(
      <FormField label="Título" error="Informe um título">
        <Input />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um título');
  });

  it('descreve o controle com descrição e erro ao mesmo tempo, nessa ordem', () => {
    render(
      <FormField label="Slug" description="Somente letras e hífens" error="Slug já usado">
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText('Slug');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toHaveLength(2);

    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Somente letras e hífens', 'Slug já usado']);
  });

  it('não marca aria-invalid quando não há erro', () => {
    render(
      <FormField label="Slug" description="Somente letras e hífens">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Slug');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('propaga required para o controle e para o rótulo', () => {
    render(
      <FormField label="Título" required>
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText(/Título/)).toBeRequired();
    expect(screen.getByText('(obrigatório)')).toHaveClass('sr-only');
  });

  it('deixa props explícitas do controle vencerem o contexto', () => {
    render(
      <FormField label="Título" required>
        <Input required={false} />
      </FormField>,
    );
    expect(screen.getByLabelText(/Título/)).not.toBeRequired();
  });

  it('mantém o rótulo apontando para o controle quando o id é escolhido à mão', () => {
    // Contrato documentado: id explícito no controle ⇒ o MESMO id em `htmlFor`.
    // O contexto não consegue adivinhar o id do filho, e um `htmlFor` órfão
    // deixa o campo sem rótulo acessível sem nenhum sinal visual.
    render(
      <FormField label="Título" htmlFor="meu-id">
        <Input id="meu-id" />
      </FormField>,
    );
    expect(screen.getByLabelText('Título')).toHaveAttribute('id', 'meu-id');
  });

  it('preserva um aria-describedby vindo do próprio controle', () => {
    render(
      <>
        <span id="externo">Dica externa</span>
        <FormField label="Título" error="Erro">
          <Input aria-describedby="externo" />
        </FormField>
      </>,
    );
    const ids = (screen.getByLabelText('Título').getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('externo');
    expect(ids.length).toBe(2);
  });

  it('mantém o rótulo acessível quando escondido visualmente', () => {
    render(
      <FormField label="Buscar" hideLabel>
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
  });

  it('gera ids únicos por instância', () => {
    render(
      <>
        <FormField label="Um">
          <Input />
        </FormField>
        <FormField label="Dois">
          <Input />
        </FormField>
      </>,
    );
    expect(screen.getByLabelText('Um').id).not.toBe(screen.getByLabelText('Dois').id);
  });

  it('funciona com Textarea e Select', () => {
    render(
      <>
        <FormField label="Resumo" error="Muito curto">
          <Textarea />
        </FormField>
        <FormField label="Status">
          <Select>
            <option value="a">A</option>
          </Select>
        </FormField>
      </>,
    );

    expect(screen.getByLabelText('Resumo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Status')).toBeInstanceOf(HTMLSelectElement);
  });
});
