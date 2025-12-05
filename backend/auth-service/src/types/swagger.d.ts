declare module 'swagger-jsdoc' {
  interface SwaggerDefinition {
    openapi?: string;
    info?: {
      title?: string;
      version?: string;
      description?: string;
      contact?: {
        name?: string;
        email?: string;
      };
      license?: {
        name?: string;
        url?: string;
      };
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
    components?: {
      securitySchemes?: Record<string, any>;
      schemas?: Record<string, any>;
    };
    security?: Array<Record<string, any[]>>;
  }

  interface Options {
    definition: SwaggerDefinition;
    apis: string[];
  }

  function swaggerJsdoc(options: Options): object;
  export = swaggerJsdoc;
}

declare module 'swagger-ui-express' {
  import { RequestHandler } from 'express';

  const serve: RequestHandler[];
  function setup(swaggerDoc: object, options?: any): RequestHandler;

  export { serve, setup };
}
