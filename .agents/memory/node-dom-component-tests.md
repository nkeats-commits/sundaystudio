---
name: Node DOM component tests
description: Constraints for running React component tests directly with Node's built-in test runner.
---

Use the existing Node test runner for focused React DOM coverage when a Vite test runner is not already present. Module mocks require Node's experimental module-mocks flag, and JSX compiled outside Vite needs a React global plus a jsdom document before importing the component.

**Why:** The app's Vite transform supplies browser and JSX runtime behavior that is absent from direct Node execution; making those prerequisites explicit keeps component tests close to the existing lightweight test suite.

**How to apply:** Add the module-mocks flag to the package test command, initialize jsdom before dynamic component imports, include the matching jsdom type package when the test project is typechecked, and mock every statically imported symbol from transitive modules. For components imported as defaults, expose a named export when a test needs to substitute them; Node's experimental mock transform can emit invalid syntax for mocked default exports.