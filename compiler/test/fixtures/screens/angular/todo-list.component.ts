import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-todo-list',
  standalone: true,
  templateUrl: './todo-list.component.html',
})
export class TodoListComponent {
  todos = input.required<string[]>();
  done = output<string>();
  filter = 'all';

  constructor(private store: TodoStore) {}

  finish(todo: string) {
    this.done.emit(todo);
  }
}
