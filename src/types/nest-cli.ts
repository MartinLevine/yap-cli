// NestJS CLI 配置类型定义

export interface NestCliProject {
  type: 'application' | 'library';
  root: string;
  entryFile: string;
  sourceRoot: string;
  compilerOptions?: {
    tsConfigPath?: string;
    webpack?: boolean;
    webpackConfigPath?: string;
  };
}

export interface NestCliConfig {
  $schema?: string;
  collection?: string;
  sourceRoot?: string;
  compilerOptions?: {
    deleteOutDir?: boolean;
    webpack?: boolean;
    tsConfigPath?: string;
  };
  monorepo?: boolean;
  root?: string;
  projects: Record<string, NestCliProject>;
}
