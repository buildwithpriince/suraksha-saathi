// `.txt` imports resolve to the file's text (metro-text-transformer.js).
declare module '*.txt' {
  const text: string;
  export default text;
}
