import { generateUsername } from '../profile'

describe('generateUsername', () => {
  it('converts display name to lowercase handle', () => {
    expect(generateUsername('Greg Spunt')).toBe('gregspunt')
  })
  it('strips special chars', () => {
    expect(generateUsername("Greg O'Brien!")).toBe('gregobrien')
  })
  it('truncates to 20 chars', () => {
    expect(generateUsername('averylongnamethatexceedstwentycharacters')).toHaveLength(20)
  })
})
