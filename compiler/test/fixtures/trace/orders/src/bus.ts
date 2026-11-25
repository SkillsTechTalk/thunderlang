export const bus = {
  publish(name: string, payload: unknown) {
    console.log(name, payload);
  },
};
