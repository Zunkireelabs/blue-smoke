import React from 'react';
import { StyleSheet, Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { BrandGround } from '../BrandGround';
import { tokens } from '../tokens';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('BrandGround', () => {
  it('is a full-bleed brand-coloured container that pads for the safe area', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <BrandGround>
          <Text>content</Text>
        </BrandGround>,
      );
    });

    const container = renderer.root.findAll((node) => typeof node.type === 'string')[0];
    const style = StyleSheet.flatten(container.props.style);

    expect(style.backgroundColor).toBe(tokens.color.brand);
    expect(style.flex).toBe(1);
    expect(style.paddingTop).toBe(0);
  });

  it('renders its children', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <BrandGround>
          <Text>hello</Text>
        </BrandGround>,
      );
    });
    expect(renderer.root.findByType(Text).props.children).toBe('hello');
  });
});
