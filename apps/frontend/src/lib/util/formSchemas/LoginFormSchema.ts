import { email, nonEmpty, object, pipe, string } from 'valibot';

export const loginFormSchema = object({
	username: pipe(string(), nonEmpty()),
	password: pipe(string(), nonEmpty())
});
