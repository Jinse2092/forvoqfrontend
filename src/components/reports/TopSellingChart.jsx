
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TopSellingChart = ({ data }) => {
   if (!data || data.length === 0) {
     return <p className="text-center text-muted-foreground py-4">No sales data available for top products.</p>;
   }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="name" type="category" width={150} />
        <Tooltip />
        <Legend />
        <Bar dataKey="quantity" fill="#82ca9d" name="Units Sold" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TopSellingChart;
  