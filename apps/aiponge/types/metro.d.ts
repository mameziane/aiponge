// Metro bundler require.context type declaration
declare const require: {
  context(
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp,
    mode?: 'sync' | 'eager' | 'lazy' | 'lazy-once'
  ): any;
} & NodeRequire;
