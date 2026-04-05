/**
 * @file swagger.ts
 * @description Swagger/OpenAPI configuration for ThirdEye API documentation.
 *              Served at GET /api/docs. Uses swagger-jsdoc to auto-generate
 *              the spec from JSDoc annotations in route files.
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ThirdEye API',
      version: '1.0.0',
      description:
        'REST API for the ThirdEye AI-powered online learning platform. ' +
        'Covers authentication, session management, rooms, and engagement records.',
    },
    servers: [{ url: 'http://localhost:5000' }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT stored in httpOnly cookie',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            name:      { type: 'string' },
            email:     { type: 'string' },
            role:      { type: 'string', enum: ['admin', 'instructor', 'student'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Session: {
          type: 'object',
          properties: {
            _id:              { type: 'string' },
            title:            { type: 'string' },
            description:      { type: 'string' },
            instructor:       { type: 'string' },
            enrolledStudents: { type: 'array', items: { type: 'string' } },
            startTime:        { type: 'string', format: 'date-time' },
            durationMinutes:  { type: 'number' },
            status:           { type: 'string', enum: ['scheduled', 'active', 'completed', 'expired'] },
            roomCode:         { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

/**
 * @description Pre-compiled Swagger specification object.
 *              Pass to swagger-ui-express to serve the docs UI.
 */
const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
