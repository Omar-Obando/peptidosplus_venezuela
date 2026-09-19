'use client';

import { useEffect, useState } from 'react';

interface Order {
    id: number;
    number: string;
    date_created: string;
    status: string;
    total: string;
    currency_symbol?: string;
}

interface RecentOrdersProps {
    token?: string | null;
    limit?: number;
}

export default function RecentOrders({ token: propToken, limit = 5 }: RecentOrdersProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(propToken || null);

    // Get token from localStorage on mount
    useEffect(() => {
        if (!propToken && typeof window !== 'undefined') {
            const stored = localStorage.getItem('phantomwp_auth');
            if (stored) {
                try {
                    const auth = JSON.parse(stored);
                    if (auth.token) {
                        setToken(auth.token);
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }
    }, [propToken]);

    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        fetchOrders();
    }, [token]);

    const fetchOrders = async () => {
        try {
            const response = await fetch(`/api/customer/orders?per_page=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch orders');
            }

            const data = await response.json();
            setOrders(data.orders || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load orders');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'processing':
                return 'bg-blue-100 text-blue-800';
            case 'on-hold':
                return 'bg-yellow-100 text-yellow-800';
            case 'pending':
                return 'bg-orange-100 text-orange-800';
            case 'cancelled':
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'refunded':
                return 'bg-purple-100 text-purple-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="py-8">
                <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-surface-alt rounded" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-500 mb-4">{error}</p>
                <button 
                    onClick={fetchOrders}
                    className="text-primary hover:text-primary-dark font-medium cursor-pointer"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="text-center py-8">
                <svg className="w-16 h-16 text-content-lighter mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-content-lighter mb-4">You haven't placed any orders yet.</p>
                <a 
                    href="/shop" 
                    className="text-primary hover:text-primary-dark font-medium cursor-pointer"
                >
                    Start shopping
                </a>
            </div>
        );
    }

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-outline">
                            <th className="text-left py-3 text-sm font-medium text-content-light">Order</th>
                            <th className="text-left py-3 text-sm font-medium text-content-light">Date</th>
                            <th className="text-left py-3 text-sm font-medium text-content-light">Status</th>
                            <th className="text-right py-3 text-sm font-medium text-content-light">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order.id} className="border-b border-outline last:border-0">
                                <td className="py-4">
                                    <a 
                                        href={`/account/orders/${order.id}`}
                                        className="text-primary hover:text-primary-dark font-medium cursor-pointer"
                                    >
                                        #{order.number}
                                    </a>
                                </td>
                                <td className="py-4 text-content-light text-sm">
                                    {formatDate(order.date_created)}
                                </td>
                                <td className="py-4">
                                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(order.status)}`}>
                                        {order.status.replace('-', ' ')}
                                    </span>
                                </td>
                                <td className="py-4 text-right font-medium text-content">
                                    {order.currency_symbol || '$'}{order.total}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <a 
                href="/account/orders" 
                className="block text-center text-primary hover:text-primary-dark mt-4 cursor-pointer"
            >
                View all orders
            </a>
        </div>
    );
}
