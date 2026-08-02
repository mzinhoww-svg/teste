/**
 * TCK-008 — Input, Textarea, Select e Label.
 *
 * O que realmente importa testar aqui não é a cor: é a AMARRAÇÃO. Um input sem
 * `htmlFor`/`id` casados é um campo anônimo para leitor de tela e para comando
 * de voz, e nada na tela denuncia isso.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

describe('Label', () => {
  it('associa o rótulo ao controle por htmlFor/id', () => {
    render(
      <>
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" />
      </>,
    );
    expect(screen.getByLabelText('Título')).toBe(screen.getByRole('textbox'));
  });

  it('marca obrigatório para vidente (*) e para leitor de tela (texto)', () => {
    render(<Label required>Título</Label>);
    // O asterisco sozinho é lido como "asterisco" — ruído, não informação.
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('(obrigatório)')).toHaveClass('sr-only');
  });

  it('esconde visualmente mantendo o rótulo acessível', () => {
    render(
      <>
        <Label htmlFor="busca" visuallyHidden>
          Buscar
        </Label>
        <Input id="busca" />
      </>,
    );
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('encaminha o ref e aceita digitação', () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(<Input ref={ref} aria-label="Nome" onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(ref.current).toBe(input);

    fireEvent.change(input, { target: { value: 'Reiners' } });
    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveValue('Reiners');
  });

  it('gera um id próprio quando nenhum é informado', () => {
    render(<Input aria-label="Sem id" />);
    expect(screen.getByRole('textbox').id).not.toBe('');
  });

  it('marca aria-invalid quando invalid', () => {
    render(<Input aria-label="Email" invalid />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('não emite aria-invalid="false" quando válido', () => {
    // `aria-invalid="false"` é ruído: a ausência do atributo já significa válido.
    render(<Input aria-label="Email" />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('usa border-line-default como limite (nunca line-subtle)', () => {
    render(<Input aria-label="Nome" />);
    const className = screen.getByRole('textbox').className;
    expect(className).toContain('border-line-default');
    expect(className).not.toContain('border-line-subtle');
  });

  it('desabilita', () => {
    render(<Input aria-label="Nome" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it.each([
    ['sm', 'h-8'],
    ['md', 'h-10'],
    ['lg', 'h-12'],
  ] as const)('aplica o tamanho %s', (inputSize, expected) => {
    render(<Input aria-label="Nome" inputSize={inputSize} />);
    expect(screen.getByRole('textbox').className).toContain(expected);
  });
});

describe('Textarea', () => {
  it('encaminha o ref e associa rótulo', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(
      <>
        <Label htmlFor="bio">Bio</Label>
        <Textarea ref={ref} id="bio" />
      </>,
    );
    expect(ref.current).toBe(screen.getByLabelText('Bio'));
  });

  it('marca aria-invalid e respeita disabled', () => {
    render(<Textarea aria-label="Bio" invalid disabled />);
    const textarea = screen.getByRole('textbox', { name: 'Bio' });
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toBeDisabled();
  });
});

describe('Select', () => {
  it('renderiza opções e reage à seleção', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Status" onChange={onChange} defaultValue="draft">
        <option value="draft">Rascunho</option>
        <option value="published">Publicado</option>
      </Select>,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    fireEvent.change(select, { target: { value: 'published' } });
    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue('published');
  });

  it('renderiza o placeholder como opção desabilitada', () => {
    render(
      <Select aria-label="Status" placeholder="Selecione..." defaultValue="">
        <option value="draft">Rascunho</option>
      </Select>,
    );
    const placeholder = screen.getByRole('option', { name: 'Selecione...' });
    expect(placeholder).toBeDisabled();
  });

  it('esconde o chevron da árvore de acessibilidade', () => {
    const { container } = render(
      <Select aria-label="Status">
        <option value="a">A</option>
      </Select>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('usa espaçamento lógico para o ícone (i18n-ready, NFR-010)', () => {
    render(
      <Select aria-label="Status">
        <option value="a">A</option>
      </Select>,
    );
    // `pe-*` em vez de `pr-*`: em RTL o chevron troca de lado sozinho.
    expect(screen.getByRole('combobox').className).toContain('pe-10');
  });

  it('encaminha o ref para o <select>, não para o wrapper', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="Status">
        <option value="a">A</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
