
/** Documentation: https://shields.io/badges/endpoint-badge */
export default interface ShieldsJSONFormat {
  /** Required. Always the number 1. */
  schemaVersion?: 1,
  /** Required. The left text, or the empty string to omit the left side of the badge. This can be overridden by the query string. */
  label: string,
  /** Required. Can't be empty. The right text. */
  message: string,
  /** 
   * Default: lightgrey. The right color. Supports the eight named colors above, as well as hex, rgb, rgba, hsl, hsla and css named colors. 
   * This can be overridden by the query string. 
  */
  color?: string,
  /** Default: grey. The left color. This can be overridden by the query string. */
  labelColor?: string,
  /** 
   * Default: false. true to treat this as an error badge. This prevents the user from overriding the color. 
   * In the future, it may affect cache behavior. 
  */
  isError?: string,
  /** Default: none. One of the simple-icons slugs. Can be overridden by the query string. */
  namedLogo?: string,
  /** Default: none. An SVG string containing a custom logo. */
  logoSvg?: string,
  /** Default: none. Same meaning as the query string. Can be overridden by the query string. Only works for simple-icons logos. */
  logoColor?: string,
  /** Default: none. Same meaning as the query string. Can be overridden by the query string. */
  logoWidth?: string,
  /** Default: flat. The default template to use. Can be overridden by the query string. */
  style?: string,
}