import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';

@Component({
  selector: 'app-cart',
  standalone: true,
  template: `
    <h2>{{ title }}</h2>
    @if (items.length === 0) {
      <p>Your cart is empty</p>
    } @else {
      <ul>
        @for (item of items; track item.id) {
          <li>{{ item.name }}: {{ item.price }}</li>
        }
      </ul>
    }
    <input placeholder="Coupon code" [(ngModel)]="coupon" />
    <button (click)="count.set(count() + 1)">Add one</button>
    <button [disabled]="items.length === 0" (click)="checkout.emit()">Checkout</button>
  `,
})
export class CartComponent {
  @Input() items: { id: string; name: string; price: number }[] = [];
  @Input() title = 'Your cart';
  @Output() checkout = new EventEmitter<void>();
  coupon = '';
  count = signal(0);
  total = computed(() => this.items.length);

  ngOnInit() {
    this.coupon = localStorage.getItem('coupon') ?? '';
  }
}
