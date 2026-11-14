// NativeWind 4 on web throws "Cannot manually set color scheme, as dark mode is type 'media'"
// at startup unless Tailwind's dark mode is 'class'. This pins the setting.
const tailwindConfig = jest.requireActual<{ darkMode?: unknown }>('../../tailwind.config.js');

describe('tailwind config', () => {
  it("uses darkMode 'class' so NativeWind web can follow the system scheme", () => {
    expect(tailwindConfig.darkMode).toBe('class');
  });
});
